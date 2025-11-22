import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import time

# Test verisi oluştur
def create_test_parquet():
    # 1000 satır test verisi
    n_rows = 1000
    
    # Zaman damgası (son 1 saat)
    end_time = datetime.utcnow()
    start_time = end_time - timedelta(hours=1)
    timestamps = pd.date_range(start=start_time, end=end_time, periods=n_rows)
    
    # Sensör verileri (gerçekçi değerler)
    data = {
        'timestamp': timestamps,
        'P1': np.random.normal(50, 10, n_rows) + np.sin(np.linspace(0, 4*np.pi, n_rows)) * 5,
        'P2': np.random.normal(45, 8, n_rows) + np.sin(np.linspace(0, 4*np.pi, n_rows)) * 3,
        'P3': np.random.normal(40, 12, n_rows) + np.cos(np.linspace(0, 4*np.pi, n_rows)) * 4,
        'P4': np.random.normal(55, 15, n_rows) + np.sin(np.linspace(0, 4*np.pi, n_rows)) * 6,
        'P5': np.random.normal(35, 9, n_rows) + np.cos(np.linspace(0, 4*np.pi, n_rows)) * 2,
        'P6': np.random.normal(60, 18, n_rows) + np.sin(np.linspace(0, 4*np.pi, n_rows)) * 7,
        'P7': np.random.normal(70, 20, n_rows) + np.sin(np.linspace(0, 4*np.pi, n_rows)) * 8,
        'P8': np.random.normal(65, 16, n_rows) + np.cos(np.linspace(0, 4*np.pi, n_rows)) * 5,
        'T1': np.random.normal(25, 5, n_rows) + np.sin(np.linspace(0, 4*np.pi, n_rows)) * 2,
        'T2': np.random.normal(30, 6, n_rows) + np.cos(np.linspace(0, 4*np.pi, n_rows)) * 3,
        'T3': np.random.normal(28, 4, n_rows) + np.sin(np.linspace(0, 4*np.pi, n_rows)) * 1.5,
        'T4': np.random.normal(32, 7, n_rows) + np.cos(np.linspace(0, 4*np.pi, n_rows)) * 2.5,
        'T5': np.random.normal(27, 5, n_rows) + np.sin(np.linspace(0, 4*np.pi, n_rows)) * 2,
        'T6': np.random.normal(35, 8, n_rows) + np.cos(np.linspace(0, 4*np.pi, n_rows)) * 3,
        'Debi1': np.random.normal(2.5, 0.5, n_rows) + np.sin(np.linspace(0, 4*np.pi, n_rows)) * 0.3,
        'Debi2': np.random.normal(2.0, 0.4, n_rows) + np.cos(np.linspace(0, 4*np.pi, n_rows)) * 0.2,
        'adiabatic_temperature': np.random.normal(1200, 100, n_rows) + np.sin(np.linspace(0, 4*np.pi, n_rows)) * 50,
        'thrust': np.random.normal(5000, 500, n_rows) + np.sin(np.linspace(0, 4*np.pi, n_rows)) * 200,
        'isp': np.random.normal(250, 25, n_rows) + np.sin(np.linspace(0, 4*np.pi, n_rows)) * 10,
        'p_chamber': np.random.normal(80, 15, n_rows) + np.sin(np.linspace(0, 4*np.pi, n_rows)) * 8,
        'oxygen_debisi': np.random.normal(15.5, 2, n_rows) + np.sin(np.linspace(0, 4*np.pi, n_rows)) * 1,
        'fuel_debisi': np.random.normal(12.3, 1.5, n_rows) + np.cos(np.linspace(0, 4*np.pi, n_rows)) * 0.8,
        'total_impulse': np.cumsum(np.random.normal(5000, 500, n_rows)),  # Kümülatif
        'exhaust_velocity': np.random.normal(2500, 200, n_rows) + np.sin(np.linspace(0, 4*np.pi, n_rows)) * 100
    }
    
    # DataFrame oluştur
    df = pd.DataFrame(data)
    
    # Negatif değerleri sıfırla
    for col in df.columns:
        if col != 'timestamp':
            df[col] = df[col].clip(lower=0)

    # Zaman damgasını microsecond'a çevir (pyarrow/parquet uyumu için)
    if 'timestamp' in df.columns:
        df['timestamp'] = df['timestamp'].astype('datetime64[us]')

    # Parquet dosyasına kaydet
    filename = f"sensor_log_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.parquet"
    df.to_parquet(filename, index=False)
    
    print(f"✅ Test parquet dosyası oluşturuldu: {filename}")
    print(f"📊 Satır sayısı: {len(df)}")
    print(f"📈 Sütun sayısı: {len(df.columns)}")
    print(f"💾 Dosya boyutu: {df.memory_usage(deep=True).sum() / 1024:.1f} KB")
    
    return filename

if __name__ == "__main__":
    create_test_parquet() 