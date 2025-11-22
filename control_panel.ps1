function Show-Menu {
    Clear-Host
    Write-Host "🚀 Roket Kontrol Sistemi - Hızlı İşlemler" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "1. Buffer Kaydet" -ForegroundColor White
    Write-Host "2. Grafik Analizi Başlat" -ForegroundColor White
    Write-Host "3. Sistem Durumu Kontrol Et" -ForegroundColor White
    Write-Host "4. Parquet Dosyalarını Listele" -ForegroundColor White
    Write-Host "5. Backend Başlat" -ForegroundColor White
    Write-Host "6. Çıkış" -ForegroundColor Red
    Write-Host ""
}

function Save-Buffer {
    Write-Host "Buffer kaydediliyor..." -ForegroundColor Green
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:5001/api/save_sensor_buffer" -Method POST
        Write-Host "✅ Buffer başarıyla kaydedildi!" -ForegroundColor Green
        Write-Host "Response: $($response.Content)" -ForegroundColor Yellow
    } catch {
        Write-Host "❌ Hata: $($_.Exception.Message)" -ForegroundColor Red
    }
    Read-Host "Devam etmek için Enter'a basın"
}

function Start-PlotAnalysis {
    Write-Host "Grafik analizi başlatılıyor..." -ForegroundColor Green
    Set-Location "backend"
    python analyze_parquet_plot.py
    Set-Location ".."
    Read-Host "Devam etmek için Enter'a basın"
}

function Get-SystemStatus {
    Write-Host "Sistem durumu kontrol ediliyor..." -ForegroundColor Green
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:5001/api/status" -Method GET
        $status = $response.Content | ConvertFrom-Json
        Write-Host "✅ Sistem Durumu:" -ForegroundColor Green
        Write-Host "   WebSocket Bağlantıları: $($status.websocket_connections)" -ForegroundColor White
        Write-Host "   Sistem Modu: $($status.system_mode)" -ForegroundColor White
        Write-Host "   Simülasyon Aktif: $($status.simulation_active)" -ForegroundColor White
        Write-Host "   Durum: $($status.status)" -ForegroundColor White
    } catch {
        Write-Host "❌ Backend'e bağlanılamadı!" -ForegroundColor Red
    }
    Read-Host "Devam etmek için Enter'a basın"
}

function Get-ParquetFiles {
    Write-Host "Parquet dosyaları listeleniyor..." -ForegroundColor Green
    $files = Get-ChildItem -Path "backend" -Filter "*.parquet" | Sort-Object LastWriteTime -Descending
    if ($files.Count -eq 0) {
        Write-Host "❌ Parquet dosyası bulunamadı!" -ForegroundColor Red
    } else {
        Write-Host "✅ Bulunan Parquet dosyaları:" -ForegroundColor Green
        foreach ($file in $files) {
            $size = [math]::Round($file.Length / 1KB, 2)
            Write-Host "   📄 $($file.Name) ($size KB) - $($file.LastWriteTime)" -ForegroundColor White
        }
    }
    Read-Host "Devam etmek için Enter'a basın"
}

function Start-Backend {
    Write-Host "Backend başlatılıyor..." -ForegroundColor Green
    Set-Location "backend"
    Start-Process python -ArgumentList "main.py" -WindowStyle Normal
    Set-Location ".."
    Write-Host "✅ Backend başlatıldı!" -ForegroundColor Green
    Read-Host "Devam etmek için Enter'a basın"
}

# Ana döngü
do {
    Show-Menu
    $choice = Read-Host "Seçiminizi yapın (1-6)"
    
    switch ($choice) {
        "1" { Save-Buffer }
        "2" { Start-PlotAnalysis }
        "3" { Get-SystemStatus }
        "4" { Get-ParquetFiles }
        "5" { Start-Backend }
        "6" { 
            Write-Host "Çıkılıyor..." -ForegroundColor Yellow
            exit 
        }
        default { 
            Write-Host "Geçersiz seçim!" -ForegroundColor Red
            Start-Sleep -Seconds 2
        }
    }
} while ($true) 