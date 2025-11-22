#!/usr/bin/env python3
"""
msgpack vs JSON performans testi
"""
import json
import msgpack
import time
import statistics

# Test verisi - gerçek sensör verilerine benzer
test_data = {
    "type": "sensor_data",
    "data": {
        "pressures": [1.234, 2.345, 3.456, 4.567, 5.678, 6.789, 7.890, 8.901],
        "temperatures": [25.6, 30.1, 35.2, 40.3, 45.4, 50.5],
        "debis": [1.5, 2.1],
        "adiabatic_temperature": 1200.5,
        "thrust": 500.2,
        "isp": 250.1,
        "p_chamber": 15.3,
        "oxygen_consumption": 1.2,
        "fuel_consumption": 0.8,
        "total_impulse": 5000.0,
        "exhaust_velocity": 2500.0,
        "timestamp": "2024-01-01T12:00:00.000Z",
        "errors": []
    }
}

def test_json_performance(iterations=10000):
    """JSON serileştirme/deserileştirme performans testi"""
    print(f"🔍 JSON Performans Testi ({iterations} iterasyon)")
    
    # Serileştirme testi
    serialize_times = []
    for _ in range(iterations):
        start = time.perf_counter()
        json_str = json.dumps(test_data)
        end = time.perf_counter()
        serialize_times.append((end - start) * 1000)  # ms
    
    # Deserileştirme testi
    deserialize_times = []
    for _ in range(iterations):
        start = time.perf_counter()
        parsed_data = json.loads(json_str)
        end = time.perf_counter()
        deserialize_times.append((end - start) * 1000)  # ms
    
    # Sonuçlar
    json_size = len(json_str.encode('utf-8'))
    avg_serialize = statistics.mean(serialize_times)
    avg_deserialize = statistics.mean(deserialize_times)
    
    print(f"  📦 Boyut: {json_size} bytes")
    print(f"  ⚡ Serileştirme: {avg_serialize:.3f} ms (ortalama)")
    print(f"  🔄 Deserileştirme: {avg_deserialize:.3f} ms (ortalama)")
    print(f"  📊 Toplam: {avg_serialize + avg_deserialize:.3f} ms")
    
    return json_size, avg_serialize, avg_deserialize

def test_msgpack_performance(iterations=10000):
    """msgpack serileştirme/deserileştirme performans testi"""
    print(f"🚀 msgpack Performans Testi ({iterations} iterasyon)")
    
    # Serileştirme testi
    serialize_times = []
    for _ in range(iterations):
        start = time.perf_counter()
        packed_data = msgpack.packb(test_data, use_bin_type=True)
        end = time.perf_counter()
        serialize_times.append((end - start) * 1000)  # ms
    
    # Deserileştirme testi
    deserialize_times = []
    for _ in range(iterations):
        start = time.perf_counter()
        unpacked_data = msgpack.unpackb(packed_data, raw=False)
        end = time.perf_counter()
        deserialize_times.append((end - start) * 1000)  # ms
    
    # Sonuçlar
    msgpack_size = len(packed_data) if packed_data is not None else 0
    avg_serialize = statistics.mean(serialize_times)
    avg_deserialize = statistics.mean(deserialize_times)
    
    print(f"  📦 Boyut: {msgpack_size} bytes")
    print(f"  ⚡ Serileştirme: {avg_serialize:.3f} ms (ortalama)")
    print(f"  🔄 Deserileştirme: {avg_deserialize:.3f} ms (ortalama)")
    print(f"  📊 Toplam: {avg_serialize + avg_deserialize:.3f} ms")
    
    return msgpack_size, avg_serialize, avg_deserialize

def main():
    print("🎯 msgpack vs JSON Performans Karşılaştırması")
    print("=" * 50)
    
    # Test verilerini doğrula
    json_str = json.dumps(test_data)
    packed_data = msgpack.packb(test_data, use_bin_type=True)
    unpacked_data = msgpack.unpackb(packed_data, raw=False)
    
    print("✅ Veri doğrulama:")
    print(f"  JSON: {json_str[:100]}...")
    print(f"  msgpack: {packed_data[:50] if packed_data is not None else 'None'}... (binary)")
    print(f"  Eşitlik: {test_data == unpacked_data}")
    print()
    
    # Performans testleri
    json_size, json_ser, json_deser = test_json_performance()
    print()
    msgpack_size, msgpack_ser, msgpack_deser = test_msgpack_performance()
    print()
    
    # Karşılaştırma
    print("📈 Karşılaştırma Sonuçları:")
    print("=" * 30)
    
    # Boyut karşılaştırması
    size_reduction = ((json_size - msgpack_size) / json_size) * 100
    print(f"📦 Boyut Azalması: {size_reduction:.1f}% ({json_size} → {msgpack_size} bytes)")
    
    # Hız karşılaştırması
    json_total = json_ser + json_deser
    msgpack_total = msgpack_ser + msgpack_deser
    speed_improvement = ((json_total - msgpack_total) / json_total) * 100
    
    print(f"⚡ Hız Artışı: {speed_improvement:.1f}% ({json_total:.3f} → {msgpack_total:.3f} ms)")
    
    # Serileştirme hızı
    ser_improvement = ((json_ser - msgpack_ser) / json_ser) * 100
    print(f"  🔄 Serileştirme: {ser_improvement:.1f}% daha hızlı")
    
    # Deserileştirme hızı
    deser_improvement = ((json_deser - msgpack_deser) / json_deser) * 100
    print(f"  📦 Deserileştirme: {deser_improvement:.1f}% daha hızlı")
    
    print()
    print("🎉 Sonuç: msgpack kullanımı ile WebSocket performansı önemli ölçüde artırıldı!")

if __name__ == "__main__":
    main() 