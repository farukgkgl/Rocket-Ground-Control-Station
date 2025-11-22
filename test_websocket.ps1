# WebSocket test script
$uri = "ws://localhost:5001/ws"

try {
    Write-Host "Testing WebSocket connection to: $uri"
    
    # Test HTTP connection first
    $httpResponse = Invoke-WebRequest -Uri "http://localhost:5001/api/status" -Method GET
    Write-Host "HTTP Status API response: $($httpResponse.StatusCode)"
    Write-Host "Response content: $($httpResponse.Content)"
    
    # Test if WebSocket endpoint exists
    $wsTestResponse = Invoke-WebRequest -Uri "http://localhost:5001/ws" -Method GET
    Write-Host "WebSocket endpoint test: $($wsTestResponse.StatusCode)"
    
} catch {
    Write-Host "Error: $($_.Exception.Message)"
    Write-Host "Full error: $($_)"
} 