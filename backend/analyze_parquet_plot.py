import pandas as pd
import matplotlib.pyplot as plt
import os
import sys

def show_menu():
    """Ana menüyü gösterir"""
    print("\n" + "="*50)
    print("📊 PARQUET DOSYA ANALİZ SİSTEMİ")
    print("="*50)
    print("1. Dosya Listesi")
    print("2. Grafik Analizi")
    print("3. Çıkış")
    print("-"*50)

def list_parquet_files():
    """Parquet dosyalarını listeler"""
    parquet_files = [f for f in os.listdir('.') if f.endswith('.parquet')]
    if not parquet_files:
        print('❌ Bu klasörde hiç .parquet dosyası bulunamadı!')
        return None
    
    print('\n📁 Bulunan Parquet dosyaları:')
    print("-"*40)
    for i, fname in enumerate(parquet_files):
        file_size = os.path.getsize(fname) / 1024  # KB
        print(f'  [{i+1}] {fname} ({file_size:.1f} KB)')
    return parquet_files

def select_file(parquet_files):
    """Dosya seçimi yapar"""
    while True:
        try:
            choice = input(f'\n📂 Hangi dosya ile çalışmak istersiniz? [1-{len(parquet_files)}]: ')
            idx = int(choice) - 1
            if 0 <= idx < len(parquet_files):
                return parquet_files[idx]
            else:
                print(f'❌ Lütfen 1-{len(parquet_files)} arasında bir sayı girin!')
        except ValueError:
            print('❌ Lütfen geçerli bir sayı girin!')

def show_column_menu(df):
    """Sütun seçim menüsünü gösterir"""
    print(f'\n📈 Dosya: {len(df)} satır, {len(df.columns)} sütun')
    print("\n🔍 Mevcut Sütunlar:")
    print("-"*40)
    
    # Sütunları kategorilere ayır
    pressure_cols = [col for col in df.columns if col.startswith('P')]
    temp_cols = [col for col in df.columns if col.startswith('T')]
    flow_cols = [col for col in df.columns if 'debi' in col.lower() or col.startswith('D')]
    performance_cols = ['thrust', 'isp', 'adiabatic_temperature', 'p_chamber', 
                       'oxygen_debisi', 'fuel_debisi', 'total_impulse', 'exhaust_velocity']
    other_cols = [col for col in df.columns if col not in pressure_cols + temp_cols + flow_cols + performance_cols + ['timestamp']]
    
    print("🌡️  SICAKLIK SENSÖRLERİ:")
    for i, col in enumerate(temp_cols, 1):
        print(f"   {i:2d}. {col}")
    
    print("\n⚡ BASINÇ SENSÖRLERİ:")
    for i, col in enumerate(pressure_cols, len(temp_cols) + 1):
        print(f"   {i:2d}. {col}")
    
    print("\n💧 DEBİ SENSÖRLERİ:")
    for i, col in enumerate(flow_cols, len(temp_cols) + len(pressure_cols) + 1):
        print(f"   {i:2d}. {col}")
    
    print("\n🚀 PERFORMANS VERİLERİ:")
    for i, col in enumerate(performance_cols, len(temp_cols) + len(pressure_cols) + len(flow_cols) + 1):
        if col in df.columns:
            print(f"   {i:2d}. {col}")
    
    if other_cols:
        print("\n📊 DİĞER VERİLER:")
        for i, col in enumerate(other_cols, len(temp_cols) + len(pressure_cols) + len(flow_cols) + len(performance_cols) + 1):
            print(f"   {i:2d}. {col}")
    
    return len(temp_cols) + len(pressure_cols) + len(flow_cols) + len([col for col in performance_cols if col in df.columns]) + len(other_cols)



def plot_data(df, column_name):
    """Veriyi çizer"""
    try:
        plt.figure(figsize=(14, 8))
        
        # Timestamp'i datetime'a çevir
        if 'timestamp' in df.columns:
            df['timestamp'] = pd.to_datetime(df['timestamp'], unit='s', errors='coerce')
            x_data = df['timestamp']
            x_label = 'Zaman'
        else:
            x_data = range(len(df))
            x_label = 'Örnek No'
        
        # Veriyi çiz
        plt.plot(x_data, df[column_name], linewidth=1.5, color='#3b82f6', alpha=0.8)
        
        # Grafik ayarları
        plt.title(f'{column_name} - Zaman Grafiği', fontsize=16, fontweight='bold', pad=20)
        plt.xlabel(x_label, fontsize=12)
        plt.ylabel(column_name, fontsize=12)
        
        # Grid ekle
        plt.grid(True, alpha=0.3)
        
        # İstatistikler
        mean_val = df[column_name].mean()
        max_val = df[column_name].max()
        min_val = df[column_name].min()
        
        plt.figtext(0.02, 0.02, f'Ortalama: {mean_val:.3f} | Max: {max_val:.3f} | Min: {min_val:.3f}', 
                   fontsize=10, style='italic', bbox=dict(boxstyle="round,pad=0.3", facecolor="lightgray", alpha=0.7))
        
        plt.tight_layout()
        plt.show()
        
        print(f'✅ {column_name} grafiği çizildi!')
        
    except Exception as e:
        print(f'❌ Grafik çizme hatası: {e}')

def analyze_file(filename):
    """Dosya analizi yapar"""
    try:
        print(f'\n📖 Dosya okunuyor: {filename}')
        df = pd.read_parquet(filename)
        print(f'✅ Dosya yüklendi: {len(df)} satır')
        
        # Kritik verileri göster
        critical_sensors = [
            'Debi1', 'Debi2',  # Oksijen ve Yakıt Debisi
            'T1', 'T2',        # Oksijen ve Yakıt Hat Sıcaklığı
            'P7', 'P8',        # Enjektöre Giren Oksijen ve Yakıt Basıncı
            'thrust', 'isp',   # İtki ve ISP
            'oxygen_consumption', 'fuel_consumption', 'total_impulse', 'exhaust_velocity',  # Tüketim ve performans
            'adiabatic_temperature', 'p_chamber'  # Sıcaklık ve basınç
        ]
        
        print('\n📊 Kritik Veriler (Özet):')
        print("-"*40)
        for sensor in critical_sensors:
            if sensor in df.columns:
                mean_val = df[sensor].mean()
                max_val = df[sensor].max()
                print(f'  • {sensor}: {mean_val:.3f} (ortalama) | Max: {max_val:.3f}')
            else:
                print(f'  • {sensor}: Sütun bulunamadı')
        
        # Sütunları kategorilere ayır
        pressure_cols = [col for col in df.columns if col.startswith('P')]
        temp_cols = [col for col in df.columns if col.startswith('T')]
        flow_cols = [col for col in df.columns if 'debi' in col.lower() or col.startswith('D')]
        performance_cols = ['thrust', 'isp', 'adiabatic_temperature', 'p_chamber', 
                           'oxygen_consumption', 'fuel_consumption', 'total_impulse', 'exhaust_velocity']
        other_cols = [col for col in df.columns if col not in pressure_cols + temp_cols + flow_cols + performance_cols + ['timestamp']]
        
        all_columns = temp_cols + pressure_cols + flow_cols + [col for col in performance_cols if col in df.columns] + other_cols
        
        # Sürekli sütun seçim döngüsü
        while True:
            print("\n" + "="*60)
            print(f"📊 DOSYA: {filename} | {len(df)} satır")
            print("="*60)
            
            # Sütun seçim menüsü
            total_columns = show_column_menu(df)
            
            print("\n🔧 SEÇENEKLER:")
            print("   • Sütun numarası girin (1, 2, 3...)")
            print("   • 'q' yazın çıkmak için")
            print("   • 'r' yazın dosya listesine dönmek için")
            print("-"*60)
            
            choice = input("\n📊 Seçiminiz: ").strip().lower()
            
            if choice == 'q':
                print("\n👋 Dosya analizi sonlandırılıyor...")
                break
            elif choice == 'r':
                print("\n🔄 Dosya listesine dönülüyor...")
                return 'return_to_files'
            else:
                try:
                    column_idx = int(choice) - 1
                    if 0 <= column_idx < len(all_columns):
                        selected_column = all_columns[column_idx]
                        print(f'\n🎯 Seçilen sütun: {selected_column}')
                        
                        # Grafik çiz
                        plot_data(df, selected_column)
                        
                        print(f"\n✅ {selected_column} grafiği çizildi!")
                        print("📊 Başka bir sütun seçebilir veya 'q' ile çıkabilirsiniz.")
                        
                    else:
                        print(f'❌ Lütfen 1-{len(all_columns)} arasında bir sayı girin!')
                        
                except ValueError:
                    print('❌ Lütfen geçerli bir sayı girin!')
            
    except Exception as e:
        print(f'❌ Dosya okuma hatası: {e}')
        return None

def main():
    """Ana fonksiyon"""
    print("🚀 Parquet Analiz Sistemi Başlatıldı!")
    
    while True:
        show_menu()
        
        try:
            choice = input("\n🔧 Seçiminizi yapın (1-3): ").strip()
            
            if choice == '1':
                # Dosya listesi
                parquet_files = list_parquet_files()
                if parquet_files:
                    input("\n⏸️  Devam etmek için Enter'a basın...")
                    
            elif choice == '2':
                # Grafik analizi
                while True:
                    parquet_files = list_parquet_files()
                    if parquet_files:
                        selected_file = select_file(parquet_files)
                        result = analyze_file(selected_file)
                        
                        if result == 'return_to_files':
                            # Dosya listesine dön, döngü devam eder
                            continue
                        else:
                            # Analiz tamamlandı, ana menüye dön
                            break
                    else:
                        input("\n⏸️  Devam etmek için Enter'a basın...")
                        break
                    
            elif choice == '3':
                print("\n👋 Çıkılıyor...")
                break
                
            else:
                print("❌ Lütfen 1-3 arasında bir seçim yapın!")
                input("\n⏸️  Devam etmek için Enter'a basın...")
                
        except KeyboardInterrupt:
            print("\n\n👋 Program kullanıcı tarafından durduruldu.")
            break
        except Exception as e:
            print(f"\n❌ Beklenmeyen hata: {e}")
            input("\n⏸️  Devam etmek için Enter'a basın...")

if __name__ == "__main__":
    main() 