# 🔘 Mekanik Buton Kontrolü

Bu sistem, Arduino üzerinden mekanik butonlar ile solenoid vanaları kontrol etmenizi sağlar.

## 📋 Donanım Gereksinimleri

### Arduino Uno
- Arduino Uno veya uyumlu board
- USB kablosu

### Mekanik Butonlar
- 8 adet mekanik buton (momentary push button)
- 8 adet 10kΩ pull-up direnci (opsiyonel - Arduino'nun dahili pull-up'ı kullanılabilir)
- Breadboard ve jumper kablolar

## 🔌 Bağlantı Şeması

### Arduino Pin Bağlantıları

| Buton | Arduino Pin | Solenoid | Açıklama |
|-------|-------------|----------|----------|
| Buton 1 | A0 | Solenoid 1 | P1 basınç sensörü kontrolü |
| Buton 2 | A1 | Solenoid 2 | P2 basınç sensörü kontrolü |
| Buton 3 | A2 | Solenoid 3 | P3 basınç sensörü kontrolü |
| Buton 4 | A3 | Solenoid 4 | P4 basınç sensörü kontrolü |
| Buton 5 | A4 | Solenoid 5 | P5 basınç sensörü kontrolü |
| Buton 6 | A5 | Solenoid 6 | P6 basınç sensörü kontrolü |
| Buton 7 | A6 | Solenoid 7 | P7 basınç sensörü kontrolü |
| Buton 8 | A7 | Solenoid 8 | P8 basınç sensörü kontrolü |

### Bağlantı Detayları

```
Buton Bağlantısı:
┌─────────┐
│  BUTON  │
│    │    │
│    ├────┼─── A0-A7 (Arduino)
│    │    │
│    └────┼─── GND
└─────────┘
```

**Not:** Arduino'nun dahili pull-up direnci kullanıldığı için harici direnç gerekmez.

## 🚀 Kurulum Adımları

### 1. Arduino Kodu Yükleme

1. `v2a/v2a.ino` dosyasını Arduino IDE'de açın
2. Arduino'yu USB ile bilgisayara bağlayın
3. Doğru portu seçin
4. Kodu yükleyin

### 2. Buton Bağlantıları

1. 8 adet mekanik butonu breadboard'a yerleştirin
2. Her butonun bir bacağını Arduino'nun A0-A7 pinlerine bağlayın
3. Her butonun diğer bacağını Arduino'nun GND pinine bağlayın

### 3. Sistem Başlatma

1. Backend'i başlatın: `python backend/main.py`
2. Frontend'i başlatın: `npm run dev` (frontend klasöründe)
3. Web arayüzünde "Mekanik Butonlar Aktif" butonuna tıklayın

## 🎮 Kullanım

### Buton Kontrolü

1. **Aktifleştirme:** Web arayüzünde "Mekanik Butonlar Aktif" butonuna tıklayın
2. **Kullanım:** Her butona basınca ilgili solenoid açılır/kapanır (toggle)
3. **Deaktifleştirme:** "Mekanik Butonlar Pasif" butonuna tıklayın

### Güvenlik Özellikleri

- **Debounce:** 50ms debounce ile yanlış tetiklemeler önlenir
- **Acil Durum:** Acil durum modunda buton kontrolü devre dışı kalır
- **Durum Senkronizasyonu:** Buton durumları web arayüzünde görüntülenir

## 🔧 Test

Buton kontrolünü test etmek için:

```bash
python test_button_control.py
```

Bu script:
1. Buton kontrolü durumunu sorgular
2. Kontrolü açar
3. Durumu kontrol eder
4. Kontrolü kapatır

## 📊 API Endpoint'leri

### Buton Kontrolü Açma/Kapama
```http
POST /api/button_control
Content-Type: application/json

{
  "action": "on"  // veya "off"
}
```

### Buton Kontrolü Durumu
```http
GET /api/button_control
```

## ⚠️ Önemli Notlar

1. **Güvenlik:** Buton kontrolü aktifken yazılım kontrolü devre dışı kalır
2. **Bağlantı:** Arduino bağlantısı kesilirse buton kontrolü otomatik devre dışı kalır
3. **Pin Kullanımı:** A0-A7 pinleri analog giriş olarak kullanılır ama dijital okuma yapılır
4. **Debounce:** Butonların mekanik titreşimlerini önlemek için 50ms debounce kullanılır

## 🛠️ Sorun Giderme

### Buton Çalışmıyor
1. Arduino bağlantısını kontrol edin
2. Pin bağlantılarını kontrol edin
3. Buton kontrolünün aktif olduğundan emin olun

### Yanlış Tetikleme
1. Debounce süresini artırın (kodda `buttonDebounceDelay` değişkeni)
2. Buton kalitesini kontrol edin
3. Bağlantıları kontrol edin

### Arduino Yanıt Vermiyor
1. USB bağlantısını kontrol edin
2. Arduino IDE'de Serial Monitor'ü açın
3. Kodu yeniden yükleyin

## 📝 Log Mesajları

Arduino Serial Monitor'de şu mesajları görebilirsiniz:

```
=== Arduino Step + Röle + Buton Kontrol Sistemi Başladı ===
Mekanik buton kontrolü: KAPALI
Mekanik buton kontrolü: AÇIK
Buton 1 basıldı - Solenoid 1 AÇILDI
Buton 1 basıldı - Solenoid 1 KAPANDI
```

Bu sistem sayesinde mekanik butonlar ile solenoid vanalarını güvenli ve kolay bir şekilde kontrol edebilirsiniz! 