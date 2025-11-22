import math
import time
import random
import asyncio
from typing import Dict, Any, List, Optional, Callable
import logging

logger = logging.getLogger(__name__)

class STM32Simulator:
    def __init__(self):
        self.base_pressures = [12.0, 15.0, 18.0, 22.0]  # Bar
        self.base_temperature = 25.0  # °C
        self.base_voltage = 28.5  # V
        self.time_start = time.monotonic()
        
        # Simülasyon parametreleri
        self.pressure_variation = 0.5  # ±0.5 bar
        self.temperature_variation = 2.0  # ±2°C
        self.voltage_variation = 0.3  # ±0.3V
        
        # Sistem durumu
        self.valve_states = [0] * 8
        self.system_mode = 'idle'  # idle, fuel_feed, emergency, leak_test
        
        # Callback fonksiyonu
        self.data_callback: Optional[Callable] = None
        
    def set_data_callback(self, callback: Callable[[Dict[str, Any]], None]):
        """Veri callback fonksiyonunu ayarlar"""
        self.data_callback = callback
        logger.info("Simülasyon callback fonksiyonu ayarlandı")
        
    def generate_realistic_pressures(self) -> List[float]:
        """Gerçekçi basınç değerleri üretir"""
        pressures = []
        current_time = time.monotonic() - self.time_start
        
        for i, base_pressure in enumerate(self.base_pressures):
            # Sinüs dalgası ile doğal değişim
            time_variation = math.sin(current_time * 0.1 + i * 0.5) * 0.3
            
            # Rastgele gürültü
            noise = random.uniform(-0.2, 0.2)
            
            # Vana durumuna göre basınç değişimi - DAHA BELİRGİN
            valve_effect = 0
            if i < len(self.valve_states) and self.valve_states[i] == 1:
                valve_effect = random.uniform(2.0, 5.0)  # Daha büyük etki
            
            # Sistem moduna göre değişim
            system_effect = 0
            if self.system_mode == 'fuel_feed':
                system_effect = random.uniform(3.0, 8.0)  # Daha büyük etki
            elif self.system_mode == 'emergency':
                system_effect = -random.uniform(5.0, 10.0)  # Daha büyük etki
            elif self.system_mode == 'leak_test':
                if i == 0:  # İlk vana açık
                    system_effect = random.uniform(-3.0, -1.0)  # Daha büyük etki
            
            final_pressure = base_pressure + time_variation + noise + valve_effect + system_effect
            final_pressure = max(0.0, min(25.0, final_pressure))  # 0-25 bar sınırı
            pressures.append(round(final_pressure, 3))
        
        return pressures
    
    def generate_realistic_temperature(self) -> float:
        """Gerçekçi sıcaklık değeri üretir"""
        current_time = time.monotonic() - self.time_start
        
        # Yavaş sıcaklık değişimi
        time_variation = math.sin(current_time * 0.05) * 1.5
        
        # Rastgele gürültü
        noise = random.uniform(-0.5, 0.5)
        
        # Sistem moduna göre sıcaklık değişimi - DAHA BELİRGİN
        system_effect = 0
        if self.system_mode == 'fuel_feed':
            system_effect = random.uniform(10.0, 20.0)  # Daha büyük etki
        elif self.system_mode == 'emergency':
            system_effect = random.uniform(-15.0, -8.0)  # Daha büyük etki
        
        final_temperature = self.base_temperature + time_variation + noise + system_effect
        final_temperature = max(0.0, min(50.0, final_temperature))  # 0-50°C sınırı
        return round(final_temperature, 1)
    
    def generate_realistic_voltage(self) -> float:
        """Gerçekçi voltaj değeri üretir"""
        current_time = time.monotonic() - self.time_start
        
        # Yavaş voltaj değişimi
        time_variation = math.sin(current_time * 0.03) * 0.2
        
        # Rastgele gürültü
        noise = random.uniform(-0.1, 0.1)
        
        # Sistem yüküne göre voltaj değişimi - DAHA BELİRGİN
        load_effect = 0
        active_valves = sum(self.valve_states)
        if active_valves > 0:
            load_effect = -active_valves * 0.5  # Daha büyük etki
            # logger.info(f"Aktif vana sayısı: {active_valves}, voltaj düşüşü: {load_effect:.2f}")
        
        final_voltage = self.base_voltage + time_variation + noise + load_effect
        final_voltage = max(24.0, min(32.0, final_voltage))  # 24-32V sınırı
        return round(final_voltage, 2)
    
    def set_valve_states(self, valves: List[int]):
        """Vana durumlarını günceller"""
        self.valve_states = valves.copy()
        # logger.info(f"Simülasyon vana durumları güncellendi: {valves}")
    
    def set_system_mode(self, mode: str):
        """Sistem modunu günceller"""
        self.system_mode = mode
        # logger.info(f"Simülasyon sistem modu güncellendi: {mode}")
    
    def generate_sensor_data(self) -> Dict[str, Any]:
        """Tüm sensör verilerini üretir"""
        # 8 basınç, 6 sıcaklık, 2 debi, adiabatic, thrust, isp, pchamber + 4 kritik veri
        # Basınçlar
        pressures = [round(self.generate_realistic_pressures()[i % 4] + random.uniform(-0.5, 0.5), 3) for i in range(8)]
        # Sıcaklıklar
        temperatures = [round(self.generate_realistic_temperature() + random.uniform(-1, 1), 1) for _ in range(6)]
        # Debi
        debis = [round(random.uniform(0.1, 1.0), 3) for _ in range(2)]
        # Diğer alanlar
        adiabatic = round(random.uniform(100, 200), 2)
        thrust = round(random.uniform(0, 1000), 2)
        isp = round(random.uniform(200, 400), 2)
        pchamber = round(random.uniform(10, 30), 2)
        
        # Yeni kritik veriler (sadece buffer'a kaydedilir)
        oxygen_consumption = round(random.uniform(0.5, 2.0), 3)
        fuel_consumption = round(random.uniform(0.3, 1.5), 3)
        total_impulse = round(random.uniform(1000, 5000), 2)
        exhaust_velocity = round(random.uniform(2000, 3000), 2)

        # STM32 formatında veri string'i oluştur
        data_string = (
            f"P1: {pressures[0]} | P2: {pressures[1]} | P3: {pressures[2]} | P4: {pressures[3]} | "
            f"P5: {pressures[4]} | P6: {pressures[5]} | P7: {pressures[6]} | P8: {pressures[7]} | "
            f"T1: {temperatures[0]} | T2: {temperatures[1]} | T3: {temperatures[2]} | T4: {temperatures[3]} | "
            f"T5: {temperatures[4]} | T6: {temperatures[5]} | "
            f"Tbogaz1: {adiabatic} | THRUST: {thrust} | ISP: {isp} | Tbogaz2: {pchamber} | "
            f"D1: {oxygen_consumption} | D2: {fuel_consumption} | IMPULSE: {total_impulse} | VELOCITY: {exhaust_velocity}"
        )

        return {
            "raw_data": data_string,
            "pressures": pressures,
            "temperatures": temperatures,
            "debis": [],  # D1 ve D2 artık yok
            "adiabatic_temperature": adiabatic,
            "thrust": thrust,
            "isp": isp,
            "p_chamber": pchamber,
            "oxygen_consumption": oxygen_consumption,  # D1 verisi oksijen tüketimi
            "fuel_consumption": fuel_consumption,      # D2 verisi yakıt tüketimi
            "total_impulse": total_impulse,
            "exhaust_velocity": exhaust_velocity,
            "timestamp": time.monotonic(),
            "system_mode": self.system_mode,
            "valve_states": self.valve_states.copy()
        }
    
    async def start_simulation(self, callback_func):
        """Simülasyon döngüsünü başlatır"""
        logger.info("STM32 simülasyonu başlatıldı")
        
        while True:
            try:
                # Sensör verilerini üret
                sensor_data = self.generate_sensor_data()
                
                # Callback fonksiyonunu çağır
                if callback_func:
                    callback_func({
                        "type": "sensor_data",
                        "raw_data": sensor_data["raw_data"],
                        "timestamp": sensor_data["timestamp"]
                    })
                
                # 1 saniye bekle (saniyede 1 veri)
                await asyncio.sleep(1)
                
            except Exception as e:
                logger.exception("Simülasyon hatası")
                await asyncio.sleep(1)

# Global simülasyon instance'ı
simulator = STM32Simulator()

def get_simulator() -> STM32Simulator:
    """Global simülasyon instance'ını döndürür"""
    return simulator

def start_simulation_task(callback_func):
    """Simülasyon görevini başlatır"""
    return asyncio.create_task(simulator.start_simulation(callback_func)) 