# Raspberry Pi 5 Ethernet Bağlantısı Rehberi

## 1. IP Adresi Öğrenme

### Raspberry Pi'de:
```bash
# IP adresini öğren
ip addr show eth0

# veya
hostname -I
```

### Windows'ta:
```powershell
# Bağlı cihazları listele
arp -a

# veya
ipconfig
```

## 2. Bağlantı Testi

### Windows'tan Raspberry Pi'ye ping:
```powershell
ping [RASPBERRY_PI_IP]
```

### Örnek: Raspberry Pi IP'si 192.168.1.100 ise
```powershell
ping 192.168.1.100
```

## 3. Frontend Erişimi

### Raspberry Pi'de backend çalıştırma:
```bash
cd /path/to/rocket/backend
python -m uvicorn main:app --host 0.0.0.0 --port 5001
```

### Windows'tan erişim:
- Tarayıcıda: `http://192.168.1.100:5001`
- Frontend'den: `http://192.168.1.100:5001/api`

## 4. Güvenlik Duvarı Ayarları

### Windows'ta:
- Windows Defender Firewall'da port 5001'i açın
- Veya geçici olarak firewall'ı kapatın (test için)

### Raspberry Pi'de:
```bash
# UFW firewall varsa
sudo ufw allow 5001
```

## 5. Potansiyel Sorunlar ve Çözümler

### Sorun 1: Bağlantı kurulamıyor
**Çözüm:** IP adresini kontrol edin, ping testi yapın

### Sorun 2: Port erişimi yok
**Çözüm:** Firewall ayarlarını kontrol edin

### Sorun 3: CORS hatası
**Çözüm:** Backend CORS ayarları zaten doğru, sorun başka bir yerde

### Sorun 4: WebSocket bağlantısı başarısız
**Çözüm:** WebSocket URL'sini kontrol edin: `ws://192.168.1.100:5001/ws` 