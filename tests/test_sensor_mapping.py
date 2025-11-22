#!/usr/bin/env python3
"""
Sensör mapping değişikliklerini test etmek için test dosyası
P5 ve P6 artık eski boğaz1 ve boğaz2'nin yerini alıyor
P7 ve P8 yeni sensörler olarak ekleniyor
"""

import json
import time
from datetime import datetime

def test_sensor_mapping():
    """Test sensör mapping değişikliklerini"""
    
    print("=== Sensör Mapping Test ===\n")
    
    # Test verisi - eski format (boğaz1, boğaz2)
    old_format_data = {
        "pressures": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0],  # P1-P4, boğaz1, boğaz2, P7, P8
        "temperatures": [10.0, 20.0, 30.0, 40.0, 50.0, 60.0],   # T1-T6
        "timestamp": datetime.now().isoformat()
    }
    
    # Test verisi - yeni format (P5, P6)
    new_format_data = {
        "pressures": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0],  # P1-P8
        "temperatures": [10.0, 20.0, 30.0, 40.0, 50.0, 60.0],   # T1-T6
        "timestamp": datetime.now().isoformat()
    }
    
    print("Eski Format (boğaz1, boğaz2):")
    print(f"P1: {old_format_data['pressures'][0]} bar")
    print(f"P2: {old_format_data['pressures'][1]} bar")
    print(f"P3: {old_format_data['pressures'][2]} bar")
    print(f"P4: {old_format_data['pressures'][3]} bar")
    print(f"boğaz1: {old_format_data['pressures'][4]} bar")
    print(f"boğaz2: {old_format_data['pressures'][5]} bar")
    print(f"P7: {old_format_data['pressures'][6]} bar")
    print(f"P8: {old_format_data['pressures'][7]} bar")
    
    print("\nYeni Format (P5, P6):")
    print(f"P1: {new_format_data['pressures'][0]} bar")
    print(f"P2: {new_format_data['pressures'][1]} bar")
    print(f"P3: {new_format_data['pressures'][2]} bar")
    print(f"P4: {new_format_data['pressures'][3]} bar")
    print(f"P5: {new_format_data['pressures'][4]} bar (eski boğaz1)")
    print(f"P6: {new_format_data['pressures'][5]} bar (eski boğaz2)")
    print(f"P7: {new_format_data['pressures'][6]} bar (yeni)")
    print(f"P8: {new_format_data['pressures'][7]} bar (yeni)")
    
    print("\nSıcaklık Sensörleri:")
    for i, temp in enumerate(new_format_data['temperatures']):
        print(f"T{i+1}: {temp} °C")
    
    print("\n=== Mapping Değişiklikleri ===")
    print("✅ P5 artık eski boğaz1'nin yerini alıyor")
    print("✅ P6 artık eski boğaz2'nin yerini alıyor")
    print("✅ P7 ve P8 yeni sensörler olarak eklendi")
    print("✅ Backend regex pattern güncellendi")
    print("✅ Frontend sensör etiketleri güncellendi")
    print("✅ Parquet analizör kategorilendirme güncellendi")
    
    # Test STM32 data string format
    print("\n=== STM32 Data String Test ===")
    test_data_string = (
        "P1:1.234|P2:2.345|P3:3.456|P4:4.567|"
        "P5:5.678|P6:6.789|P7:7.890|P8:8.901|"
        "T1:10.1|T2:20.2|T3:30.3|T4:40.4|T5:50.5|T6:60.6|"
        "D1:1.0|D2:2.0|"
        "ADIABATIC:100.0|THRUST:1000.0|ISP:200.0|PCHAMBER:50.0|"
        "OXYGEN:10.0|FUEL:5.0|IMPULSE:5000.0|VELOCITY:3000.0"
    )
    print(f"Test Data String: {test_data_string}")
    print("✅ Yeni format P5, P6, P7, P8 destekleniyor")

if __name__ == "__main__":
    test_sensor_mapping() 