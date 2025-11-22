Write-Host "Buffer kaydediliyor..." -ForegroundColor Green
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5001/api/save_sensor_buffer" -Method POST
    Write-Host "✅ Buffer başarıyla kaydedildi!" -ForegroundColor Green
    Write-Host "Response: $($response.Content)" -ForegroundColor Yellow
} catch {
    Write-Host "❌ Hata: $($_.Exception.Message)" -ForegroundColor Red
}
Read-Host "Devam etmek için Enter'a basın" 