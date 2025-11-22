import serial
import serial.tools.list_ports
import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)

class ArduinoController:
    def __init__(self, baudrate=115200, timeout=5):
        self.baudrate = baudrate
        self.timeout = timeout
        self.connection: Optional[serial.Serial] = None
        self.port = None

    def find_port(self):
        ports = list(serial.tools.list_ports.comports())
        for port in ports:
            if "Arduino" in port.description or "CH340" in port.description or "USB Serial" in port.description:
                return port.device
        # Otomatik bulunamazsa COM3-COM8 arası sırayla dene (Windows)
        for i in range(3, 9):
            test_port = f'COM{i}'
            try:
                ser = serial.Serial(test_port, self.baudrate, timeout=self.timeout)
                ser.close()
                return test_port
            except Exception:
                continue
        return None

    def connect(self):
        self.port = self.find_port()
        if not self.port:
            logger.error("Arduino portu bulunamadı.")
            self.connection = None
            return False
        try:
            self.connection = serial.Serial(self.port, self.baudrate, timeout=self.timeout)
            logger.info(f"Arduino bağlantısı başarılı: {self.port}")
            time.sleep(2)  # Arduino'nun başlamasını bekle
            # Başlangıç mesajlarını temizle
            while self.connection.in_waiting > 0:
                self.connection.readline()
            return True
        except Exception as e:
            logger.exception("Arduino bağlantı hatası")
            self.connection = None
            return False

    def is_connected(self):
        return self.connection is not None and self.connection.is_open

    def disconnect(self):
        if self.connection and self.connection.is_open:
            self.connection.close()
            logger.info("Arduino bağlantısı kapatıldı.")
        self.connection = None

    def send_command(self, command):
        if not self.is_connected():
            logger.error("Arduino bağlantısı yok.")
            return False, "Arduino bağlantısı yok"
        assert self.connection is not None, "Bağlantı kontrolü geçtiyse connection None olamaz."
        try:
            if not command.endswith('\n'):
                command += '\n'
            logger.info(f"Arduino'ya komut gönderiliyor: '{command.strip()}'")
            self.connection.write(command.encode())
            self.connection.flush()
            time.sleep(1)
            response = ""
            while self.connection.in_waiting > 0:
                line = self.connection.readline().decode().strip()
                if line:
                    response += line + " "
                    logger.info(f"Arduino yanıtı: '{line}'")
            
            # Hem step motor hem de solenoid komutları için başarı kontrolü
            success = (
                "Yeni Pozisyon" in response or 
                "Dönüyor" in response or 
                "Motor dönüş tamamlandı" in response or
                "Solenoid durumu güncellendi" in response or
                "Mekanik buton kontrolü" in response or
                "Buton kontrolü durumu" in response or
                "Gelen komut" in response  # Arduino'nun komutu aldığını gösterir
            )
            return success, response.strip()
        except Exception as e:
            logger.exception("Arduino komut hatası")
            return False, str(e)
