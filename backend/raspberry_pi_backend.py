import asyncio
import serial
import json
try:
    import msgpack
    MSGPACK_AVAILABLE = True
except ImportError:
    MSGPACK_AVAILABLE = False
    print("⚠️ msgpack modülü bulunamadı, JSON modunda çalışılacak")
import logging
import re
import os
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import time
import serial.tools.list_ports
import numpy as np
import threading
import pandas as pd
import queue

# Logging konfigürasyonu
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = FastAPI(title="Roket Kontrol Sistemi API - Raspberry Pi", version="1.0.0")

# CORS ayarları
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Yüksek Frekanslı Sensor Data Buffer ---
# Raspberry Pi için optimize edilmiş buffer boyutu (1GB RAM için)
BUFFER_SIZE = 10_000 * 60 * 10  # 10kHz * 60s * 10dk = 6 milyon satır (10 dakika)
# Sadece 14 kritik veri buffer/parquet'e kaydedilecek
SENSOR_COLUMNS = [
    'timestamp',
    'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8',
    'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'Tbogaz1', 'Tbogaz2',
    'Debi1', 'Debi2',
    'thrust', 'isp',
    'oxygen_consumption', 'fuel_consumption', 'total_impulse', 'exhaust_velocity'
]

# RAM buffer: Ayrı timestamp buffer (float64) ve sensor buffer (float32)
timestamp_buffer = np.zeros(BUFFER_SIZE, dtype=np.float64)  # Timestamp için float64
sensor_buffer = np.zeros((BUFFER_SIZE, len(SENSOR_COLUMNS) - 1), dtype=np.float32)  # Diğer veriler için float32
buffer_index = 0
buffer_lock = threading.Lock()

# Buffer'a veri ekle (sadece 14 kritik veri)
def append_sensor_to_buffer(sensor_data: Dict[str, Any]):
    global buffer_index
    with buffer_lock:
        if buffer_index < BUFFER_SIZE:
            # Timestamp'i ayrı float64 buffer'a kaydet (epoch, ondalıklı saniye)
            timestamp_buffer[buffer_index] = float(time.time())
            # Diğer sensör verilerini float32 buffer'a kaydet
            pressures = sensor_data.get("pressures", [0.0]*8)
            temperatures = sensor_data.get("temperatures", [0.0]*8)  # 6 + 2 yeni sıcaklık sensörü
            debis = sensor_data.get("debis", [0.0, 0.0])
            sensor_row = np.array([
                pressures[0] if len(pressures) > 0 else 0.0,  # P1
                pressures[1] if len(pressures) > 1 else 0.0,  # P2
                pressures[2] if len(pressures) > 2 else 0.0,  # P3
                pressures[3] if len(pressures) > 3 else 0.0,  # P4
                pressures[4] if len(pressures) > 4 else 0.0,  # P5
                pressures[5] if len(pressures) > 5 else 0.0,  # P6
                pressures[6] if len(pressures) > 6 else 0.0,  # P7
                pressures[7] if len(pressures) > 7 else 0.0,  # P8
                temperatures[0] if len(temperatures) > 0 else 0.0,  # T1
                temperatures[1] if len(temperatures) > 1 else 0.0,  # T2
                temperatures[2] if len(temperatures) > 2 else 0.0,  # T3
                temperatures[3] if len(temperatures) > 3 else 0.0,  # T4
                temperatures[4] if len(temperatures) > 4 else 0.0,  # T5
                temperatures[5] if len(temperatures) > 5 else 0.0,  # T6
                temperatures[6] if len(temperatures) > 6 else 0.0,  # Tbogaz1
                temperatures[7] if len(temperatures) > 7 else 0.0,  # Tbogaz2
                debis[0] if len(debis) > 0 else 0.0,  # Debi1
                debis[1] if len(debis) > 1 else 0.0,  # Debi2
                sensor_data.get("thrust", 0.0),
                sensor_data.get("isp", 0.0),
                sensor_data.get("oxygen_consumption", 0.0),
                sensor_data.get("fuel_consumption", 0.0),
                sensor_data.get("total_impulse", 0.0),
                sensor_data.get("exhaust_velocity", 0.0)
            ], dtype=np.float32)
            sensor_buffer[buffer_index, :] = sensor_row
            buffer_index += 1
            if buffer_index >= BUFFER_SIZE * 0.9:
                logger.warning(f"Buffer %90 doldu! ({buffer_index}/{BUFFER_SIZE})")
        else:
            logger.error("Sensor buffer tamamen doldu! Veri kaybı oluyor.")

# Buffer'ı Parquet olarak kaydet (optimize edilmiş)
def save_sensor_buffer(filename: Optional[str] = None, clear_after_save: bool = True):
    global buffer_index
    with buffer_lock:
        n = buffer_index
        if n == 0:
            logger.warning("Buffer boş, kayıt yapılmadı.")
            return
        
        try:
            # Timestamp ve sensor verilerini birleştir
            # timestamp_buffer (float64) + sensor_buffer (float32) -> DataFrame
            combined_data = np.concatenate([
                timestamp_buffer[:n, None],  # timestamp sütunu (float64)
                sensor_buffer[:n, :]         # diğer sensör verileri (float32)
            ], axis=1)
            
            if combined_data.shape[1] != len(SENSOR_COLUMNS):
                logger.error(f"Veri sütun sayısı ({combined_data.shape[1]}) ile başlık sayısı ({len(SENSOR_COLUMNS)}) uyuşmuyor!")
                return
            
            # Optimize DataFrame creation
            df = pd.DataFrame(combined_data, columns=pd.Index(SENSOR_COLUMNS), copy=False)
            
            if filename is None:
                filename = f"sensor_log_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.parquet"
            
            # Compressed parquet for smaller file size
            df.to_parquet(filename, index=False, compression='snappy')
            logger.info(f"Sensor buffer {n} satır ile kaydedildi: {filename}")
            
            # Clear buffer after successful save
            if clear_after_save:
                buffer_index = 0
                logger.info("Buffer temizlendi.")
                
        except Exception as e:
            logger.exception("Buffer kaydetme hatası")
            raise

# WebSocket bağlantıları için manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket bağlantısı eklendi. Toplam: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket bağlantısı kaldırıldı. Toplam: {len(self.active_connections)}")

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        if self.active_connections:
            await asyncio.gather(
                *[connection.send_text(message) for connection in self.active_connections]
            )
    
    def to_native(self, obj):
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, (np.floating,)):
            return float(obj)
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, dict):
            return {k: self.to_native(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [self.to_native(x) for x in obj]
        return obj

    async def broadcast_binary(self, data: Dict[str, Any]):
        """msgpack ile binary format kullanarak veri gönderir"""
        if self.active_connections:
            if MSGPACK_AVAILABLE:
                try:
                    native_data = self.to_native(data)
                    packed_data = msgpack.packb(native_data, use_bin_type=True)
                    if packed_data is not None:
                        await asyncio.gather(*[connection.send_bytes(packed_data) for connection in self.active_connections])
                    else:
                        # Fallback: JSON kullan
                        await self.broadcast(json.dumps(data))
                except Exception as e:
                    logger.exception(f"msgpack paketleme hatası: {e}, veri: {data}")
                    # Fallback: JSON kullan
                    await self.broadcast(json.dumps(self.to_native(data)))
            else:
                # msgpack yoksa direkt JSON kullan
                await self.broadcast(json.dumps(self.to_native(data)))

manager = ConnectionManager()

# Sensör verileri
sensor_data = {
    "pressures": [0.0] * 8,
    "temperatures": [0.0] * 6,
    "debis": [0.0] * 2,
    "adiabatic_temperature": 0.0,
    "thrust": 0.0,
    "isp": 0.0,
    "p_chamber": 0.0,
    "oxygen_consumption": 0.0,
    "fuel_consumption": 0.0,
    "total_impulse": 0.0,
    "exhaust_velocity": 0.0,
    "deltap2": 0.0,
    "kutlesel_debi": 0.0,
    "timestamp": "",
    "errors": [],
    "valves": [0] * 9 # Vana durumlarını buraya taşı
}

# Vana durumları
valve_states = [0] * 9

# Sistem durumu
system_mode = 'idle'

# UART bağlantıları
stm32_uart = None
arduino_uart = None
stm32_lock = threading.Lock()

# Arduino komut kuyruğu ve thread'i
arduino_cmd_queue = queue.Queue()
arduino_resp_queue = queue.Queue()

# Arduino worker thread

def arduino_worker():
    while True:
        item = arduino_cmd_queue.get()
        if item is None:
            break
        cmd, expect_response = item
        try:
            if arduino_uart is not None:
                arduino_uart.write(cmd.encode())
                arduino_uart.flush()
                if expect_response:
                    timeout = time.time() + 0.5
                    response = ""
                    while time.time() < timeout:
                        if arduino_uart.in_waiting > 0:
                            line = arduino_uart.readline().decode(errors='ignore').strip()
                            if line:
                                response += line + " "
                                break
                        time.sleep(0.01)
                    arduino_resp_queue.put(response.strip())
                else:
                    arduino_resp_queue.put(None)
            else:
                arduino_resp_queue.put(None)
        except Exception as e:
            logger.warning(f"Arduino worker hata: {e}")
            arduino_resp_queue.put(None)
        finally:
            arduino_cmd_queue.task_done()

# Thread başlatıcı (startup event'te çağrılacak)
arduino_thread = threading.Thread(target=arduino_worker, daemon=True)

# Remove the continuous feedback thread (stm32_feedback_reader and feedback_thread)
# Restore the emergency endpoint to read the first feedback line after sending the command


# Pydantic modelleri
class ValveCommand(BaseModel):
    valves: List[int]

class StepMotorCommand(BaseModel):
    motor_id: int
    angle: float

class SystemStatus(BaseModel):
    status: str
    message: str

# STM32 veri parsing fonksiyonu (esnek, özel alanlarla)
def parse_stm32_data(data_string: str) -> Optional[Dict[str, Any]]:
    # Sadece sensör verisi satırlarını filtrele
    if data_string.strip().startswith("P1:"):
        if not ("P1:" in data_string and "VELOCITY:" in data_string):
            logger.warning(f"Geçersiz veya eksik STM32 sensör verisi atlandı: {data_string}")
            return None
        try:
            logger.debug(f"Parsing STM32 data: {data_string}")
            # Önce tam pattern ile dene
            pattern = (
                r'P1:\s*"?([-+]?\d*\.?\d+)"?\s*\|\s*P2:\s*"?([-+]?\d*\.?\d+)"?\s*\|\s*P3:\s*"?([-+]?\d*\.?\d+)"?\s*\|\s*P4:\s*"?([-+]?\d*\.?\d+)"?\s*\|\s*'
                r'P5:\s*"?([-+]?\d*\.?\d+)"?\s*\|\s*P6:\s*"?([-+]?\d*\.?\d+)"?\s*\|\s*P7:\s*"?([-+]?\d*\.?\d+)"?\s*\|\s*P8:\s*"?([-+]?\d*\.?\d+)"?\s*\|\s*'
                r'T1:\s*"?([-+]?\d*\.?\d+)"?\s*\|\s*T2:\s*"?([-+]?\d*\.?\d+)"?\s*\|\s*T3:\s*"?([-+]?\d*\.?\d+)"?\s*\|\s*T4:\s*"?([-+]?\d*\.?\d+)"?\s*\|\s*'
                r'T5:\s*"?([-+]?\d*\.?\d+)"?\s*\|\s*T6:\s*"?([-+]?\d*\.?\d+)"?\s*\|\s*'
                r'Tbogaz1:\s*"?([-+]?\d*\.?\d+)"?\s*\|\s*THRUST:\s*"?([-+]?\d*\.?\d+)"?\s*\|\s*ISP:\s*"?([-+]?\d*\.?\d+)"?\s*\|\s*Tbogaz2:\s*"?([-+]?\d*\.?\d+)"?\s*\|\s*'
                r'D1:\s*"?([-+]?\d*\.?\d+)"?\s*\|\s*D2:\s*"?([-+]?\d*\.?\d+)"?\s*\|\s*IMPULSE:\s*"?([-+]?\d*\.?\d+)"?\s*\|\s*VELOCITY:\s*"?([-+]?\d*\.?\d+)"?'
            )
            match = re.search(pattern, data_string)
            if match:
                values = list(map(float, match.groups()))
                return {
                    "pressures": values[0:8],
                    "temperatures": values[8:14] + [values[15], values[18]],  # T1-T6 + Tbogaz1 + Tbogaz2
                    "debis": [],  # D1 ve D2 artık yok
                    "adiabatic_temperature": 0.0,  # Artık yok
                    "thrust": values[16],
                    "isp": values[17],
                    "p_chamber": 0.0,  # Artık yok
                    "oxygen_consumption": values[19],  # D1 verisi oksijen tüketimi olarak
                    "fuel_consumption": values[20],    # D2 verisi yakıt tüketimi olarak
                    "total_impulse": values[21],
                    "exhaust_velocity": values[22],
                    "deltap2": 0.0,
                    "kutlesel_debi": 0.0,
                    "timestamp": datetime.utcnow().isoformat(),
                    "errors": []
                }
            # Eğer tam eşleşme yoksa, esnek anahtar-değer parser kullan
            result = {}
            for part in data_string.split('|'):
                part = part.strip()
                match = re.match(r'([A-Za-z0-9_çÇşŞıİöÖüÜğĞ\s]+):\s*([-+]?\d*\.?\d+)', part)
                if match:
                    key, value = match.groups()
                    key = key.strip().lower().replace(' ', '_').replace('ç','c').replace('ş','s').replace('ı','i').replace('ö','o').replace('ü','u').replace('ğ','g')
                    result[key] = float(value)
            # Standart alanlar
            pressures = [result.get(f'p{i+1}', 0.0) for i in range(8)]
            temperatures = [result.get(f't{i+1}', 0.0) for i in range(6)]
            # Yeni sıcaklık sensörleri
            temperatures.append(result.get('tbogaz1', 0.0))
            temperatures.append(result.get('tbogaz2', 0.0))
            # D1 ve D2 verileri oksijen ve yakıt tüketimi olarak
            # Özel alanlar
            deltap2 = result.get('dp2', 0.0)
            kutlesel_debi = result.get('kutlesel_debi', 0.0)
            return {
                "pressures": pressures,
                "temperatures": temperatures,
                "debis": [],  # D1 ve D2 artık yok
                "adiabatic_temperature": 0.0,  # Artık yok
                "thrust": result.get("thrust", 0.0),
                "isp": result.get("isp", 0.0),
                "p_chamber": 0.0,  # Artık yok
                "oxygen_consumption": result.get("d1", result.get("oxygen", 0.0)),  # D1 verisi oksijen tüketimi
                "fuel_consumption": result.get("d2", result.get("fuel", 0.0)),      # D2 verisi yakıt tüketimi
                "total_impulse": result.get("impulse", 0.0),
                "exhaust_velocity": result.get("velocity", 0.0),
                "deltap2": deltap2,
                "kutlesel_debi": kutlesel_debi,
                "timestamp": datetime.utcnow().isoformat(),
                "errors": []
            }
        except Exception as e:
            logger.exception("Veri parsing hatası")
            logger.error(f"Hatalı veri: {data_string}")
            return None
    else:
        # Diğer log/mesaj satırlarını sadece bilgi olarak logla, uyarı verme
        logger.info(f"STM32 mesaj/log: {data_string}")
        return None

# UART bağlantılarını başlat
def init_uart_connections():
    global stm32_uart, arduino_uart
    try:
        ports = serial.tools.list_ports.comports()
        for port in ports:
            try:
                # Önce cihazı tespit etmek için düşük hızda aç
                ser = serial.Serial(port.device,115200,timeout=0.1,write_timeout=0.1,inter_byte_timeout=0.01)
                time.sleep(0.5)
                # Öncelikli olarak port.device'a bak
                if 'ttyUSB' in port.device:
                    # Arduino için 115200 baud ile yeniden aç
                    ser.close()
                    ser = serial.Serial(port.device,115200,timeout=0.1,write_timeout=0.1,inter_byte_timeout=0.01)
                    arduino_uart = ser
                    logger.info(f"Arduino bulundu: {port.device} (115200 baud)")
                elif 'ttyACM' in port.device:
                    # STM32 için 230400 baud ile yeniden aç
                    ser.close()
                    ser = serial.Serial(
                        port.device,
                        230400,
                        timeout=0.1,
                        write_timeout=0.1,
                        inter_byte_timeout=0.01,
                        parity=serial.PARITY_NONE,
                        stopbits=serial.STOPBITS_ONE,
                        bytesize=serial.EIGHTBITS
                    )
                    stm32_uart = ser
                    logger.info(f"STM32 bulundu: {port.device} (230400 baud)")
                else:
                    # Eski kontrolleri de yedek olarak bırak
                    if ser.in_waiting > 0:
                        first_line = ser.readline().decode(errors='ignore').strip()
                        if 'STM' in first_line.upper():
                            ser.close()
                            ser = serial.Serial(
                                port.device,
                                230400,
                                timeout=0.1,
                                write_timeout=0.1,
                                inter_byte_timeout=0.01,
                                parity=serial.PARITY_NONE,
                                stopbits=serial.STOPBITS_ONE,
                                bytesize=serial.EIGHTBITS
                            )
                            stm32_uart = ser
                            logger.info(f"STM32 bulundu: {port.device} (ilk veri: {first_line}, 230400 baud)")
                        elif 'ARDUINO' in first_line.upper() or 'CH340' in port.description.upper():
                            ser.close()
                            ser = serial.Serial(
                                port.device,
                                115200,
                                timeout=0.1,
                                write_timeout=0.1,
                                inter_byte_timeout=0.01
                            )
                            arduino_uart = ser
                            logger.info(f"Arduino bulundu: {port.device} (ilk veri: {first_line}, 115200 baud)")
                    else:
                        if 'CH340' in port.description.upper():
                            ser.close()
                            ser = serial.Serial(
                                port.device,
                                115200,
                                timeout=0.1,
                                write_timeout=0.1,
                                inter_byte_timeout=0.01
                            )
                            arduino_uart = ser
                            logger.info(f"Arduino bulundu: {port.device} (CH340, 115200 baud)")
                        elif 'STM' in port.description.upper():
                            ser.close()
                            ser = serial.Serial(
                                port.device,
                                230400,
                                timeout=0.1,
                                write_timeout=0.1,
                                inter_byte_timeout=0.01,
                                parity=serial.PARITY_NONE,
                                stopbits=serial.STOPBITS_ONE,
                                bytesize=serial.EIGHTBITS
                            )
                            stm32_uart = ser
                            logger.info(f"STM32 bulundu: {port.device} (desc, 230400 baud)")
            except Exception as e:
                logger.info(f"{port.device} portunda cihaz bulunamadı: {e}")
    except Exception as e:
        logger.exception("UART bağlantı hatası")

async def async_init_uart_connections_with_retry(retries=5, delay=2):
    for attempt in range(retries):
        init_uart_connections()
        if stm32_uart or arduino_uart:
            logger.info("UART bağlantısı başarılı.")
            return
        logger.warning(f"UART cihazı bulunamadı, {delay} sn sonra tekrar denenecek... (Deneme {attempt+1}/{retries})")
        await asyncio.sleep(delay)
    logger.error("UART cihazı bulunamadı, tüm denemeler başarısız.")

def init_uart_connections_with_retry(retries=5, delay=2):
    for attempt in range(retries):
        init_uart_connections()
        if stm32_uart or arduino_uart:
            logger.info("UART bağlantısı başarılı.")
            return
        logger.warning(f"UART cihazı bulunamadı, {delay} sn sonra tekrar denenecek... (Deneme {attempt+1}/{retries})")
        time.sleep(delay)
    logger.error("UART cihazı bulunamadı, tüm denemeler başarısız.")

# WebSocket throttling için sayaç
websocket_counter = 0
WEBSOCKET_THROTTLE = 3  # Her 3 veride bir WebSocket'e gönder (daha hızlı güncelleme)

# Otomatik buffer kaydetme için sayaç
auto_save_counter = 0
AUTO_SAVE_INTERVAL = 10000  # Her 10,000 veride bir otomatik kaydet

# STM32 watchdog için sayaç
last_received_time = time.monotonic()
WATCHDOG_TIMEOUT = 5.0  # 5 saniye timeout

# Parquet dosya yönetimi
MAX_PARQUET_FILES = 100
BACKUP_INTERVAL = 1000  # Her 1000 veride bir backup

# Buffer yedekleme için sayaç
backup_counter = 0

# STM32'den veri okuma görevi
async def read_stm32_data():
    """STM32'den sürekli veri okur ve buffer'a kaydeder"""
    global sensor_data, stm32_uart, websocket_counter, auto_save_counter, last_received_time, backup_counter
    logger.info("🔄 STM32 veri okuma görevi başlatıldı - bağlantı bekleniyor...")
    while True:
        try:
            if stm32_uart is None:
                logger.debug("STM32 bağlantısı yok, 10 saniye bekleniyor...")
                await asyncio.sleep(10)
                if time.monotonic() - last_received_time > 10:
                    logger.info("STM32 yeniden bağlanma denemesi...")
                    asyncio.create_task(async_init_uart_connections_with_retry())
                    last_received_time = time.monotonic()
                continue
            # STM32 bağlı ve veri var mı kontrol et
            with stm32_lock:
                in_waiting = stm32_uart.in_waiting if stm32_uart else 0
            if in_waiting > 0:
                with stm32_lock:
                    data = stm32_uart.readline().decode(errors='ignore').strip()
                if data:
                    last_received_time = time.monotonic()
                    parsed_data = parse_stm32_data(data)
                    if parsed_data:
                        logger.info(f"STM32 veri: {data}")

                        sensor_data.update(parsed_data)
                        append_sensor_to_buffer(sensor_data)
                        websocket_counter += 1
                        if websocket_counter >= WEBSOCKET_THROTTLE:
                            frontend_data = {
                                "type": "sensor_data",
                                "data": {
                                    "pressures": sensor_data["pressures"],
                                    "temperatures": sensor_data["temperatures"],
                                    "debis": sensor_data["debis"],
                                    "adiabatic_temperature": sensor_data["adiabatic_temperature"],
                                    "thrust": sensor_data["thrust"],
                                    "isp": sensor_data["isp"],
                                    "p_chamber": sensor_data["p_chamber"],
                                    "oxygen_consumption": sensor_data["oxygen_consumption"],
                                    "fuel_consumption": sensor_data["fuel_consumption"],
                                    "total_impulse": sensor_data["total_impulse"],
                                    "exhaust_velocity": sensor_data["exhaust_velocity"],
                                    "deltap2": sensor_data["deltap2"],
                                    "kutlesel_debi": sensor_data["kutlesel_debi"],
                                    "timestamp": sensor_data["timestamp"],
                                    "errors": sensor_data["errors"]
                                }
                            }
                            await manager.broadcast_binary(frontend_data)
                            websocket_counter = 0
                        backup_counter += 1
                        if backup_counter >= BACKUP_INTERVAL:
                            asyncio.create_task(backup_buffer())
                            backup_counter = 0
                        auto_save_counter += 1
                        if auto_save_counter >= AUTO_SAVE_INTERVAL:
                            logger.info(f"Otomatik buffer kaydetme başlatılıyor... ({auto_save_counter} veri)")
                            asyncio.create_task(auto_save_buffer())
                            auto_save_counter = 0
                    else:
                        logger.info(f"STM32 feedback: {data}")
            else:
                if time.monotonic() - last_received_time > WATCHDOG_TIMEOUT:
                    logger.warning("STM32 watchdog timeout - bağlantı koptu!")
                    if stm32_uart:
                        with stm32_lock:
                            stm32_uart.close()
                        stm32_uart = None
                    asyncio.create_task(async_init_uart_connections_with_retry())
                    last_received_time = time.monotonic()
                else:
                    await asyncio.sleep(0.005)  # 5ms bekle
        except Exception as e:
            logger.exception("STM32 veri okuma hatası")
            if stm32_uart:
                with stm32_lock:
                    stm32_uart.close()
                stm32_uart = None
            logger.info("STM32 bağlantısı koptu, yeniden bağlanmayı deniyor...")
            asyncio.create_task(async_init_uart_connections_with_retry())
            last_received_time = time.monotonic()
            await asyncio.sleep(1)

# Buffer yedekleme fonksiyonu
async def backup_buffer():
    """Buffer'ı .npy formatında yedekler"""
    global buffer_index
    try:
        with buffer_lock:
            if buffer_index > 0:
                backup_filename = f"buffer_backup_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.npy"
                # Timestamp ve sensor verilerini birleştirip yedekle
                combined_data = np.concatenate([
                    timestamp_buffer[:buffer_index, None],  # timestamp sütunu (float64)
                    sensor_buffer[:buffer_index, :]         # diğer sensör verileri (float32)
                ], axis=1)
                np.save(backup_filename, combined_data)
                logger.debug(f"Buffer yedeklendi: {backup_filename} ({buffer_index} satır)")
    except Exception as e:
        logger.exception("Buffer yedekleme hatası")

# Yedek dosyaları merge etme fonksiyonu
def merge_backup_files():
    """Uygulama başlangıcında sadece en yeni yedek dosyayı RAM buffer'a yükler"""
    global buffer_index
    try:
        import glob
        backup_files = glob.glob("buffer_backup_*.npy")
        if backup_files:
            # Sadece en yeni dosyayı seç
            backup_files.sort()
            newest_backup = backup_files[-1]
            try:
                data = np.load(newest_backup)
                # Buffer'a yükle (timestamp ve sensor verilerini ayır)
                with buffer_lock:
                    n = len(data)
                    if n <= BUFFER_SIZE:
                        timestamp_buffer[:n] = data[:, 0]
                        sensor_buffer[:n, :] = data[:, 1:]
                        buffer_index = n
                        logger.info(f"Yedek veriler buffer'a yüklendi: {buffer_index} satır (dosya: {newest_backup})")
                    else:
                        start_idx = n - BUFFER_SIZE
                        timestamp_buffer[:] = data[start_idx:, 0]
                        sensor_buffer[:] = data[start_idx:, 1:]
                        buffer_index = BUFFER_SIZE
                        logger.info(f"Yedek veriler buffer'a yüklendi (son {BUFFER_SIZE} satır): {buffer_index} satır (dosya: {newest_backup})")
            except Exception as e:
                logger.exception(f"Yedek dosya yükleme hatası: {newest_backup}")
            # Tüm yedek dosyaları sil
            for backup_file in backup_files:
                try:
                    os.remove(backup_file)
                    logger.debug(f"Yedek dosya silindi: {backup_file}")
                except Exception as e:
                    logger.warning(f"Yedek dosya silinemedi: {backup_file}")
    except Exception as e:
        logger.exception("Yedek dosya merge hatası")

# Parquet dosyalarını temizle
def cleanup_parquet_files():
    """Eski parquet dosyalarını temizler"""
    try:
        import glob
        parquet_files = glob.glob("sensor_log_*.parquet")
        if len(parquet_files) > MAX_PARQUET_FILES:
            # En eski dosyaları sil
            parquet_files.sort()
            files_to_delete = parquet_files[:-MAX_PARQUET_FILES]
            for file in files_to_delete:
                try:
                    os.remove(file)
                    logger.info(f"Eski parquet dosyası silindi: {file}")
                except Exception as e:
                    logger.warning(f"Parquet dosyası silinemedi: {file}")
    except Exception as e:
        logger.exception("Parquet dosya temizleme hatası")

# Otomatik buffer kaydetme
async def auto_save_buffer():
    """Buffer'ı otomatik olarak kaydeder"""
    try:
        save_sensor_buffer()
        cleanup_parquet_files()
        logger.info("Otomatik buffer kaydetme tamamlandı")
    except Exception as e:
        logger.exception("Otomatik buffer kaydetme hatası")

# --- 120 saniyede bir buffer kaydeden görev ---
async def periodic_buffer_save_task():
    """Her 120 saniyede bir buffer'ı kaydeder."""
    while True:
        try:
            logger.info("⏳ 120 sn aralıklı otomatik buffer kaydetme başlatılıyor...")
            save_sensor_buffer()
            cleanup_parquet_files()
            logger.info("✅ 120 sn aralıklı otomatik buffer kaydedildi.")
        except Exception as e:
            logger.exception("120 sn aralıklı buffer kaydetme hatası")
        await asyncio.sleep(120)

# STM32'ye vana komutu gönder
async def send_valve_command_to_stm32(valves: List[int]) -> bool:
    global stm32_uart
    if stm32_uart is None:
        logger.error("STM32 UART bağlantısı yok")
        return False
    try:
        # Vana dizisini 9 karaktere tamamla veya kes
        v = (valves + [0]*9)[:9]
        cmd_str = "Valves:" + "".join(map(str, v)) + "\n"  # Capital V
        with stm32_lock:
            stm32_uart.write(cmd_str.encode())
            stm32_uart.flush()
        logger.info(f"STM32'ye vana komutu gönderildi: {cmd_str.strip()}")
        return True
    except Exception as e:
        logger.warning(f"STM32 vana komut hatası: {e}")
        return False

# Arduino'ya step motor komutu gönder
async def send_step_motor_command_to_arduino(motor_id: int, angle: float) -> tuple[bool, str]:
    global arduino_uart
    if arduino_uart is None:
        logger.error("Arduino UART bağlantısı yok")
        return False, "Arduino bağlantısı yok"
    try:
        # Motor ID'yi de komuta dahil et
        command = f"{motor_id}:{angle}\n"
        arduino_cmd_queue.put((command, True))
        await asyncio.sleep(0.1)
        response = arduino_resp_queue.get()
        arduino_resp_queue.task_done()
        logger.info(f"Arduino'ya step motor komutu gönderildi: {command.strip()} | Cevap: {response}")
        success = "Yeni Pozisyon" in (response or "") or "Motor dönüş tamamlandı" in (response or "")
        return success, (response or "")
    except Exception as e:
        logger.warning(f"Arduino step motor komut hatası: {e}")
        return False, str(e)

# WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    logger.info("WebSocket bağlantı isteği alındı")
    await manager.connect(websocket)
    logger.info("WebSocket bağlantısı kabul edildi")
    
    try:
        while True:
            # Gelen mesajları işle
            data = await websocket.receive_text()
            logger.info(f"WebSocket mesajı alındı: {data}")
            message = json.loads(data)
            
            if message.get("type") == "valve_command":
                # Vana komutlarını işle
                global valve_states
                valve_states = message.get("valves", [0]*9)
                if len(valve_states) < 9:
                    valve_states = (valve_states + [0]*9)[:9]
                elif len(valve_states) > 9:
                    valve_states = valve_states[:9]
                
                # STM32'ye vana komutu gönder
                success = await send_valve_command_to_stm32(valve_states)
                
                response_data = {
                    "type": "valve_response",
                    "success": success,
                    "valves": valve_states
                }
                try:
                    packed_data = msgpack.packb(response_data, use_bin_type=True)
                    if packed_data is not None:
                        await websocket.send_bytes(packed_data)
                    else:
                        await websocket.send_text(json.dumps(response_data))
                except Exception as e:
                    logger.exception("msgpack paketleme hatası")
                    await websocket.send_text(json.dumps(response_data))
                # Broadcast the new valve state to all WebSocket clients
                try:
                    await manager.broadcast(json.dumps({
                        "type": "valve_state",
                        "valves": valve_states
                    }))
                except Exception as e:
                    logger.error(f"Valve state broadcast error: {e}")
                
            elif message.get("type") == "step_motor_command":
                # Step motor komutunu işle
                motor_id = message.get("motor_id", 1)
                angle = message.get("angle", 0.0)
                success, response = await send_step_motor_command_to_arduino(motor_id, angle)
                response_data = {
                    "type": "step_motor_response",
                    "success": success,
                    "motor_id": motor_id,
                    "angle": angle,
                    "response": response
                }
                try:
                    packed_data = msgpack.packb(response_data, use_bin_type=True)
                    if packed_data is not None:
                        await websocket.send_bytes(packed_data)
                    else:
                        await websocket.send_text(json.dumps(response_data))
                except Exception as e:
                    logger.exception("msgpack paketleme hatası")
                    await websocket.send_text(json.dumps(response_data))
                
            elif message.get("type") == "system_mode":
                # Sistem modu değişikliği
                global system_mode
                system_mode = message.get("mode", "idle")
                logger.info(f"Sistem modu değiştirildi: {system_mode}")
                
            elif message.get("type") == "get_sensors":
                # Sensör verilerini gönder
                response_data = {
                    "type": "sensor_data",
                    "data": sensor_data
                }
                try:
                    packed_data = msgpack.packb(response_data, use_bin_type=True)
                    if packed_data is not None:
                        await websocket.send_bytes(packed_data)
                    else:
                        await websocket.send_text(json.dumps(response_data))
                except Exception as e:
                    logger.exception("msgpack paketleme hatası")
                    await websocket.send_text(json.dumps(response_data))
                
                
    except WebSocketDisconnect:
        logger.info("WebSocket bağlantısı koptu")
        manager.disconnect(websocket)
    except Exception as e:
        logger.exception("WebSocket hatası")
        manager.disconnect(websocket)

# HTTP API endpoints
@app.get("/api/hello")
async def hello():
    return {"message": "Roket Kontrol Sistemi - Raspberry Pi Backend", "status": "running"}

@app.get("/api/sensors")
async def get_sensors():
    return sensor_data

@app.post("/api/valves")
async def set_valves(command: ValveCommand):
    global valve_states
    valve_states = command.valves
    if len(valve_states) < 9:
        valve_states = (valve_states + [0]*9)[:9]
    elif len(valve_states) > 9:
        valve_states = valve_states[:9]
    
    # STM32'ye komut gönder
    success = await send_valve_command_to_stm32(valve_states)
    
    if success:
        return {"success": True, "valves": valve_states}
    else:
        raise HTTPException(status_code=500, detail="STM32 komut gönderme hatası")

@app.post("/api/step_motor")
async def set_step_motor(command: StepMotorCommand):
    success, response = await send_step_motor_command_to_arduino(command.motor_id, command.angle)
    if success:
        return {
            "success": True, 
            "motor_id": command.motor_id, 
            "angle": command.angle,
            "response": response
        }
    else:
        raise HTTPException(status_code=500, detail=f"Arduino komut hatası: {response}")

@app.get("/api/status")
async def get_system_status():
    # UART bağlantı durumlarını kontrol et
    stm32_connected = stm32_uart is not None and stm32_uart.is_open
    arduino_connected = arduino_uart is not None and arduino_uart.is_open
    
    return {
        "system_mode": system_mode,
        "stm32_connected": stm32_connected,
        "arduino_connected": arduino_connected,
        "websocket_connections": len(manager.active_connections),
        "simulation_active": not stm32_connected,  # STM32 bağlı değilse simülasyon
        "status": "operational" if (stm32_connected or arduino_connected) else "error"
    }

@app.post("/api/save_sensor_buffer")
async def api_save_sensor_buffer():
    """RAM'deki sensor buffer'ı Parquet dosyasına kaydeder."""
    save_sensor_buffer()
    return {"status": "ok", "message": f"Buffer kaydedildi (parquet)"}

@app.get("/api/buffer_status")
async def buffer_status():
    return {
        "buffer_index": buffer_index,
        "buffer_size": BUFFER_SIZE
    }

# Parquet dosyalarını listele
@app.get("/api/parquet_files")
async def list_parquet_files():
    """Parquet dosyalarını listeler"""
    try:
        import glob
        import os
        parquet_files = glob.glob("sensor_log_*.parquet")
        files_info = []
        
        for file_path in parquet_files:
            try:
                file_size = os.path.getsize(file_path) / 1024  # KB
                files_info.append({
                    "name": os.path.basename(file_path),
                    "size": round(file_size, 1),
                    "path": file_path
                })
            except Exception as e:
                logger.warning(f"Dosya bilgisi alınamadı: {file_path}")
        
        # En yeni dosyalar önce gelsin
        files_info.sort(key=lambda x: x["name"], reverse=True)
        return files_info
    except Exception as e:
        logger.exception("Parquet dosya listesi hatası")
        raise HTTPException(status_code=500, detail="Dosya listesi alınamadı")

# Parquet dosyasının verilerini getir
@app.get("/api/parquet_data/{filename}")
async def get_parquet_data(filename: str):
    """Parquet dosyasının verilerini döner"""
    try:
        import os
        # Güvenlik: sadece sensor_log_ ile başlayan dosyalara izin ver
        if not filename.startswith("sensor_log_") or not filename.endswith(".parquet"):
            raise HTTPException(status_code=400, detail="Geçersiz dosya adı")
        if not os.path.exists(filename):
            raise HTTPException(status_code=404, detail="Dosya bulunamadı")
        # Parquet dosyasını oku
        df = pd.read_parquet(filename)
        # Veriyi JSON'a çevir (sadece ilk 1000 satır - performans için)
        max_rows = min(1000, len(df))
        df_sample = df.head(max_rows)
        # Timestamp sütununu olduğu gibi (float) bırak
        return {
            "columns": df_sample.columns.tolist(),
            "rowCount": len(df),
            "data": df_sample.to_dict('list')
        }
    except Exception as e:
        logger.exception(f"Parquet dosya okuma hatası: {filename}")
        raise HTTPException(status_code=500, detail="Dosya okunamadı")

SCENARIO_COMMANDS = {
    "o2cleaning": "o2cleaning\n",
    "fuelcleaning": "fuelcleaning\n",
    "preburning": "preburning\n",
    "burningstart": "burningstart\n",
    "burning": "burning\n",
    "emergency": "emergency\n"
}

# --- Emergency komutu için özel fonksiyon ---
async def send_emergency_command_to_stm32():
    global stm32_uart
    if stm32_uart is None or not stm32_uart.is_open:
        logger.error("STM32 UART bağlantısı yok (emergency)")
        return False, "STM32 bağlantısı yok"
    try:
        # Komut göndermeden önce 200ms bekle
        await asyncio.sleep(0.2)
        cmd = "emergency\n"
        logger.info(f"Gönderilecek komut: '{cmd}' (bytes: {cmd.encode()})")
        with stm32_lock:
            stm32_uart.write(cmd.encode())
            stm32_uart.flush()
            time.sleep(0.1)  # 100ms bekle
            logger.info("Komut gönderildi.")
        # Komut cevabını bekle
        feedback = ""
        timeout = time.time() + 2.0  # 2 saniye bekle
        while time.time() < timeout:
            if stm32_uart.in_waiting > 0:
                line = stm32_uart.readline().decode(errors='ignore').strip()
                logger.info(f"STM32 komut sonrası gelen: {line}")
                # Sadece komut cevabını al
                if line and (line.lower().startswith("ack:") or line.lower().startswith("nack:") or "gelen komut" in line.lower() or "emergency" in line.lower() or "acil" in line.lower()):
                    feedback += line + "\n"
                    break
            else:
                time.sleep(0.01)
        logger.info(f"STM32 emergency feedback: {feedback.strip()}")
        return True, feedback.strip() or "No feedback"
    except Exception as e:
        logger.warning(f"STM32 emergency komut hatası: {e}")
        return False, str(e)

@app.post("/api/scenario/{scenario_name}")
async def run_scenario(scenario_name: str):
    """STM32'ye senaryo komutu gönderir"""
    global stm32_uart
    if scenario_name.lower() == "emergency":
        success, feedback = await send_emergency_command_to_stm32()
        if success:
            return {"status": "ok", "message": f"emergency senaryosu çalıştırıldı", "feedback": feedback}
        else:
            return {"status": "error", "message": f"emergency komutu başarısız: {feedback}"}
    cmd = SCENARIO_COMMANDS.get(scenario_name.lower())
    if not cmd:
        return {"status": "error", "message": f"Geçersiz senaryo: {scenario_name}"}
    if stm32_uart is None or not stm32_uart.is_open:
        return {"status": "error", "message": "STM32 bağlantısı yok"}
    try:
        with stm32_lock:
            stm32_uart.write(cmd.encode())
            stm32_uart.flush()
        logger.info(f"Sent to STM32: {cmd.strip()}")
        return {"status": "ok", "message": f"{scenario_name} senaryosu çalıştırıldı"}
    except Exception as e:
        return {"status": "error", "message": f"Hata: {str(e)}"}

@app.post("/api/system_mode/{mode}")
async def set_system_mode(mode: str):
    """STM32'ye sadece mod ismi (örn: 'burning') gönderir"""
    global stm32_uart, system_mode
    if stm32_uart is None or not stm32_uart.is_open:
        return {"status": "error", "message": "STM32 bağlantısı yok"}
    try:
        cmd = f"{mode}\n"
        with stm32_lock:
            stm32_uart.write(cmd.encode())
            stm32_uart.flush()
        system_mode = mode
        return {"status": "ok", "message": f"Mod değiştirildi: {mode}"}
    except Exception as e:
        return {"status": "error", "message": f"Hata: {str(e)}"}

# Startup event
@app.on_event("startup")
async def startup_event():
    logger.info("🚀 Raspberry Pi Backend başlatılıyor...")
    merge_backup_files()
    asyncio.create_task(read_stm32_data())
    logger.info("✅ STM32 veri okuma görevi başlatıldı (bağlantı bekleniyor)")
    await async_init_uart_connections_with_retry()
    # Arduino worker thread başlat
    if not arduino_thread.is_alive():
        arduino_thread.start()
    # Feedback thread kaldırıldı
    logger.info("✅ Backend başlatma tamamlandı")
    # --- 60 sn aralıklı buffer kaydetme görevini başlat ---
    asyncio.create_task(periodic_buffer_save_task())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5001)

# Static dosyaları serve et (frontend için) - EN SONA ALINDI
app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="static")

@app.get("/")
async def index():
    return FileResponse("frontend/dist/index.html")