# Frontend Dosyalarını Raspberry Pi'a Kopyalama Rehberi

## Yöntem 1: SCP ile (Önerilen)

### Windows'tan Raspberry Pi'a:
```powershell
# Frontend dist klasörünü kopyala
scp -r frontend/dist pi@192.168.1.100:/home/pi/rocket/frontend/

# Tüm proje dosyalarını kopyala
scp -r . pi@192.168.1.100:/home/pi/rocket/
```

### Linux/Mac'ten:
```bash
# Frontend dist klasörünü kopyala
scp -r frontend/dist pi@192.168.1.100:/home/pi/rocket/frontend/

# Tüm proje dosyalarını kopyala
scp -r . pi@192.168.1.100:/home/pi/rocket/
```

## Yöntem 2: USB Bellek ile

1. **Windows'ta:**
   - `frontend/dist` klasörünü USB belleğe kopyala
   - USB belleği Raspberry Pi'a tak

2. **Raspberry Pi'da:**
   ```bash
   # USB belleği mount et
   sudo mount /dev/sda1 /mnt/usb
   
   # Dosyaları kopyala
   cp -r /mnt/usb/dist /home/pi/rocket/frontend/
   
   # USB'yi çıkar
   sudo umount /mnt/usb
   ```

## Yöntem 3: Git ile

### Raspberry Pi'da:
```bash
# Git kur (eğer yoksa)
sudo apt install git

# Projeyi clone et
git clone [REPO_URL] /home/pi/rocket

# Frontend'i build et
cd /home/pi/rocket/frontend
npm install
npm run build
```

## Yöntem 4: SFTP ile

### FileZilla veya WinSCP kullanarak:
- Host: `192.168.1.100` (Raspberry Pi IP'si)
- Username: `pi`
- Password: Raspberry Pi şifresi
- Port: `22`

`frontend/dist` klasörünü `/home/pi/rocket/frontend/` dizinine kopyala.

## Dosya Yapısı Kontrolü

Raspberry Pi'da şu yapı olmalı:
```
/home/pi/rocket/
├── raspberry_pi_backend.py
├── pi_requirements.txt
├── pi_start.sh
├── frontend/
│   └── dist/
│       ├── index.html
│       ├── assets/
│       └── ...
└── ...
```

## Test Etme

Kopyalama sonrası:
```bash
# Dizin yapısını kontrol et
ls -la /home/pi/rocket/frontend/

# Backend'i başlat
cd /home/pi/rocket
./pi_start.sh

# Tarayıcıda test et
# http://192.168.1.100:5001
``` 