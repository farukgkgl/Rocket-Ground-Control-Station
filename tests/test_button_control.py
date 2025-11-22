#!/usr/bin/env python3
"""
Mekanik buton kontrolü test dosyası
Bu dosya Arduino'ya buton komutları göndererek test eder
"""

import requests
import time
import json

# API URL
API_URL = "http://localhost:5001/api"

def test_button_control():
    """Buton kontrolü test fonksiyonu"""
    print("🔘 Mekanik Buton Kontrolü Testi")
    print("=" * 50)
    
    # 1. Buton kontrolü durumunu sorgula
    print("1. Buton kontrolü durumu sorgulanıyor...")
    try:
        response = requests.get(f"{API_URL}/button_control")
        data = response.json()
        print(f"   Durum: {data}")
        
        if data.get("status") == "ok":
            is_enabled = data.get("button_control_enabled", False)
            print(f"   Buton kontrolü: {'AÇIK' if is_enabled else 'KAPALI'}")
        else:
            print(f"   Hata: {data.get('message', 'Bilinmeyen hata')}")
            return
            
    except Exception as e:
        print(f"   Bağlantı hatası: {e}")
        return
    
    # 2. Buton kontrolünü aç
    print("\n2. Buton kontrolü açılıyor...")
    try:
        response = requests.post(f"{API_URL}/button_control", 
                               json={"action": "on"})
        data = response.json()
        print(f"   Sonuç: {data}")
        
        if data.get("status") == "ok":
            print("   ✅ Buton kontrolü başarıyla açıldı")
        else:
            print(f"   ❌ Hata: {data.get('message', 'Bilinmeyen hata')}")
            
    except Exception as e:
        print(f"   ❌ Bağlantı hatası: {e}")
    
    # 3. 3 saniye bekle
    print("\n3. 3 saniye bekleniyor...")
    time.sleep(3)
    
    # 4. Durumu tekrar kontrol et
    print("\n4. Durum tekrar kontrol ediliyor...")
    try:
        response = requests.get(f"{API_URL}/button_control")
        data = response.json()
        
        if data.get("status") == "ok":
            is_enabled = data.get("button_control_enabled", False)
            print(f"   Buton kontrolü: {'AÇIK' if is_enabled else 'KAPALI'}")
        else:
            print(f"   Hata: {data.get('message', 'Bilinmeyen hata')}")
            
    except Exception as e:
        print(f"   Bağlantı hatası: {e}")
    
    # 5. Buton kontrolünü kapat
    print("\n5. Buton kontrolü kapatılıyor...")
    try:
        response = requests.post(f"{API_URL}/button_control", 
                               json={"action": "off"})
        data = response.json()
        print(f"   Sonuç: {data}")
        
        if data.get("status") == "ok":
            print("   ✅ Buton kontrolü başarıyla kapatıldı")
        else:
            print(f"   ❌ Hata: {data.get('message', 'Bilinmeyen hata')}")
            
    except Exception as e:
        print(f"   ❌ Bağlantı hatası: {e}")
    
    print("\n" + "=" * 50)
    print("Test tamamlandı!")

if __name__ == "__main__":
    test_button_control() 