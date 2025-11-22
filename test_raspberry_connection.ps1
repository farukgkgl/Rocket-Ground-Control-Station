# Raspberry Pi Bağlantı Test Scripti
param(
    [Parameter(Mandatory=$true)]
    [string]$RaspberryPiIP
)

Write-Host "🔍 Raspberry Pi Bağlantı Testi" -ForegroundColor Green
Write-Host "📍 Hedef IP: $RaspberryPiIP" -ForegroundColor Cyan
Write-Host ""

# 1. Ping Testi
Write-Host "📡 Ping Testi..." -ForegroundColor Yellow
try {
    $pingResult = Test-Connection -ComputerName $RaspberryPiIP -Count 4 -Quiet
    if ($pingResult) {
        Write-Host "✅ Ping başarılı!" -ForegroundColor Green
    } else {
        Write-Host "❌ Ping başarısız!" -ForegroundColor Red
        Write-Host "Lütfen IP adresini ve bağlantıyı kontrol edin." -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "❌ Ping hatası: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 2. Port Testi
Write-Host "🔌 Port 5001 Testi..." -ForegroundColor Yellow
try {
    $tcpClient = New-Object System.Net.Sockets.TcpClient
    $tcpClient.ConnectAsync($RaspberryPiIP, 5001).Wait(5000) | Out-Null
    
    if ($tcpClient.Connected) {
        Write-Host "✅ Port 5001 erişilebilir!" -ForegroundColor Green
        $tcpClient.Close()
    } else {
        Write-Host "❌ Port 5001 erişilemez!" -ForegroundColor Red
        Write-Host "Backend'in çalıştığından emin olun." -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Port testi hatası: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Backend'in çalıştığından emin olun." -ForegroundColor Yellow
}

Write-Host ""

# 3. HTTP API Testi
Write-Host "🌐 HTTP API Testi..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://$RaspberryPiIP:5001/api/hello" -TimeoutSec 10
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ HTTP API erişilebilir!" -ForegroundColor Green
        Write-Host "📄 Yanıt: $($response.Content)" -ForegroundColor Gray
    } else {
        Write-Host "❌ HTTP API hatası: $($response.StatusCode)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ HTTP API hatası: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# 4. WebSocket Testi
Write-Host "🔗 WebSocket Testi..." -ForegroundColor Yellow
try {
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $cancellationToken = New-Object System.Threading.CancellationToken
    $ws.ConnectAsync("ws://$RaspberryPiIP:5001/ws", $cancellationToken).Wait(5000) | Out-Null
    
    if ($ws.State -eq 'Open') {
        Write-Host "✅ WebSocket bağlantısı başarılı!" -ForegroundColor Green
        $ws.CloseAsync($cancellationToken).Wait() | Out-Null
    } else {
        Write-Host "❌ WebSocket bağlantısı başarısız!" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ WebSocket hatası: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "🎯 Test Tamamlandı!" -ForegroundColor Green
Write-Host "Frontend'i şu URL ile test edebilirsiniz:" -ForegroundColor Cyan
Write-Host "http://$RaspberryPiIP:5001" -ForegroundColor White 