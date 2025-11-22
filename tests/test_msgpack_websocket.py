#!/usr/bin/env python3
"""
msgpack WebSocket test scripti
"""
import asyncio
import websockets
import json
import msgpack
import time

async def test_websocket_msgpack():
    """WebSocket msgpack testi"""
    uri = "ws://localhost:5001/ws"
    
    try:
        async with websockets.connect(uri) as websocket:
            print("🔗 WebSocket bağlantısı kuruldu")
            
            # Test mesajı gönder
            test_message = {
                "type": "get_sensors"
            }
            
            print(f"📤 Gönderilen mesaj: {test_message}")
            await websocket.send(json.dumps(test_message))
            
            # Yanıt al
            response = await websocket.recv()
            print(f"📥 Alınan yanıt tipi: {type(response)}")
            
            # msgpack binary data kontrolü
            if isinstance(response, bytes):
                print("✅ Binary data alındı (msgpack)")
                try:
                    decoded_data = msgpack.unpackb(response, raw=False)
                    print(f"📦 Decode edilen veri: {decoded_data}")
                    print(f"📊 Veri tipi: {decoded_data.get('type')}")
                    if 'data' in decoded_data:
                        sensor_data = decoded_data['data']
                        print(f"🌡️ Sıcaklık sayısı: {len(sensor_data.get('temperatures', []))}")
                        print(f"📊 Basınç sayısı: {len(sensor_data.get('pressures', []))}")
                        print(f"💧 Debi sayısı: {len(sensor_data.get('debis', []))}")
                except Exception as e:
                    print(f"❌ msgpack decode hatası: {e}")
            else:
                print("📝 Text data alındı (JSON fallback)")
                try:
                    parsed_data = json.loads(response)
                    print(f"📦 Parse edilen veri: {parsed_data}")
                except Exception as e:
                    print(f"❌ JSON parse hatası: {e}")
            
            print("✅ Test tamamlandı!")
            
    except Exception as e:
        print(f"❌ WebSocket bağlantı hatası: {e}")

async def test_valve_command():
    """Vana komutu testi"""
    uri = "ws://localhost:5001/ws"
    
    try:
        async with websockets.connect(uri) as websocket:
            print("\n🔧 Vana Komutu Testi")
            
            # Vana komutu gönder
            valve_command = {
                "type": "valve_command",
                "valves": [1, 0, 1, 0, 1, 0, 1, 0]
            }
            
            print(f"📤 Vana komutu gönderiliyor: {valve_command}")
            await websocket.send(json.dumps(valve_command))
            
            # Yanıt al
            response = await websocket.recv()
            print(f"📥 Yanıt tipi: {type(response)}")
            
            if isinstance(response, bytes):
                print("✅ Binary yanıt (msgpack)")
                decoded_data = msgpack.unpackb(response, raw=False)
                print(f"📦 Yanıt: {decoded_data}")
            else:
                print("📝 Text yanıt (JSON)")
                parsed_data = json.loads(response)
                print(f"📦 Yanıt: {parsed_data}")
            
            print("✅ Vana komutu testi tamamlandı!")
            
    except Exception as e:
        print(f"❌ Vana komutu testi hatası: {e}")

async def main():
    print("🎯 msgpack WebSocket Testi")
    print("=" * 40)
    
    # Sensör verisi testi
    await test_websocket_msgpack()
    
    # Vana komutu testi
    await test_valve_command()
    
    print("\n🎉 Tüm testler tamamlandı!")

if __name__ == "__main__":
    asyncio.run(main()) 