import asyncio
import json
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Dict, Any
from datetime import datetime
import os

from hardware.arduino import ArduinoController
from simulation import get_simulator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Roket Kontrol Sistemi API (Windows)", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AppState:
    def __init__(self):
        self.arduino = ArduinoController()
        self.system_mode = 'idle'
        self.sensor_data = {
            "pressures": [0.0]*8,
            "temperatures": [0.0]*6,
            "debis": [0.0]*2,
            "adiabatic_temperature": 0.0,
            "thrust": 0.0,
            "isp": 0.0,
            "p_chamber": 0.0,
            "oxygen_consumption": 0.0,
            "fuel_consumption": 0.0,
            "total_impulse": 0.0,
            "exhaust_velocity": 0.0,
            "timestamp": "",
            "errors": []
        }
        self.websocket_clients: List[WebSocket] = []

state = AppState()

# WebSocket bağlantı yönetimi
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

    async def broadcast(self, message: str):
        if self.active_connections:
            await asyncio.gather(*[conn.send_text(message) for conn in self.active_connections])

manager = ConnectionManager()

# Step motor komutu modeli
class StepMotorCommand(BaseModel):
    motor_id: int
    angle: float

# WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            logger.info(f"WebSocket mesajı alındı: {data}")
            message = json.loads(data)
            if message.get("type") == "step_motor_command":
                motor_id = message.get("motor_id", 1)
                angle = message.get("angle", 0.0)
                success, response = await handle_step_motor_command(motor_id, angle)
                await websocket.send_text(json.dumps({
                    "type": "step_motor_response",
                    "success": success,
                    "motor_id": motor_id,
                    "angle": angle,
                    "response": response
                }))
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.exception("WebSocket hatası")
        manager.disconnect(websocket)

# Simülasyon callback
async def simulation_callback():
    simulator = get_simulator()
    while True:
        sensor_data = simulator.generate_sensor_data()
        state.sensor_data = sensor_data
        # WebSocket ile yayınla
        await manager.broadcast(json.dumps({
            "type": "sensor_data",
            "data": sensor_data
        }))
        await asyncio.sleep(0.1)

# Step motor komutu gönderme
async def handle_step_motor_command(motor_id: int, angle: float):
    if not state.arduino.is_connected():
        logger.info("Arduino bağlı değil, yeniden bağlanmayı deniyor...")
        if not state.arduino.connect():
            return False, "Arduino bağlantısı yok"
    command = f"{motor_id}:{angle}"
    success, response = state.arduino.send_command(command)
    return success, response

# API endpointleri
@app.get("/api/hello")
async def hello():
    return {"message": "Roket Kontrol Sistemi API (Windows)", "status": "running"}

@app.get("/api/sensors")
async def get_sensors():
    return state.sensor_data

@app.post("/api/step_motor")
async def set_step_motor(command: StepMotorCommand):
    success, response = await handle_step_motor_command(command.motor_id, command.angle)
    if success:
        return {"success": True, "motor_id": command.motor_id, "angle": command.angle, "response": response}
    else:
        raise HTTPException(status_code=500, detail=f"Arduino komut hatası: {response}")

@app.get("/api/status")
async def get_system_status():
    return {
        "system_mode": state.system_mode,
        "arduino_connected": state.arduino.is_connected(),
        "websocket_connections": len(manager.active_connections),
        "status": "operational" if state.arduino.is_connected() else "error"
    }

@app.get("/")
async def index():
    static_folder = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
    index_path = os.path.join(static_folder, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    else:
        return {"error": "Frontend dosyaları bulunamadı"}

@app.get("/{path:path}")
async def serve_static(path: str):
    if path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API endpoint bulunamadı")
    static_folder = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
    file_path = os.path.join(static_folder, path)
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return FileResponse(file_path)
    else:
        index_path = os.path.join(static_folder, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        else:
            return {"error": "Dosya bulunamadı"}

@app.on_event("startup")
async def startup_event():
    logger.info("Roket kontrol sistemi başlatılıyor...")
    if state.arduino.connect():
        logger.info("Arduino bağlantısı başarılı")
    else:
        logger.warning("Arduino bağlantısı başarısız - step motor kontrolü devre dışı")
    # Simülasyon başlat
    asyncio.create_task(simulation_callback())
    logger.info("✅ Simülasyon başlatıldı (STM32 verisi simüle ediliyor)")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=5001, log_level="info")