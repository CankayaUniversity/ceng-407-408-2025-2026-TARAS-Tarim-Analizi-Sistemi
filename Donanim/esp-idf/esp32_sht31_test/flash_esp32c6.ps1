# ESP32-C6 Build and Flash Script
Write-Host "ESP32-C6 Build and Flash Script" -ForegroundColor Green
Write-Host "--------------------------------" -ForegroundColor Green

# Initialize ESP-IDF environment
Write-Host "`nStep 1: Initializing ESP-IDF environment..." -ForegroundColor Cyan
& "C:\Espressif\frameworks\esp-idf-v5.5.1\export.ps1"

# Set target to ESP32-C6
Write-Host "`nStep 2: Setting target to ESP32-C6..." -ForegroundColor Cyan
idf.py set-target esp32c6

# Build the project
Write-Host "`nStep 3: Building the project..." -ForegroundColor Cyan
idf.py build

# Get available COM ports
$ports = [System.IO.Ports.SerialPort]::GetPortNames()
if ($ports.Count -eq 0) {
    Write-Host "`nError: No COM ports found!" -ForegroundColor Red
    exit 1
}

# If there's only one COM port, use it automatically
if ($ports.Count -eq 1) {
    $selectedPort = $ports[0]
    Write-Host "`nAutomatically selected port: $selectedPort" -ForegroundColor Yellow
}
else {
    # Show available ports and let user choose
    Write-Host "`nAvailable COM ports:" -ForegroundColor Yellow
    for ($i = 0; $i -lt $ports.Count; $i++) {
        Write-Host "$($i + 1): $($ports[$i])"
    }
    
    do {
        $selection = Read-Host "`nSelect COM port number (1-$($ports.Count))"
        $index = [int]$selection - 1
    } while ($index -lt 0 -or $index -ge $ports.Count)
    
    $selectedPort = $ports[$index]
}

# Flash the project
Write-Host "`nStep 4: Flashing to ESP32-C6 on port $selectedPort..." -ForegroundColor Cyan
idf.py -p $selectedPort flash

# Ask if user wants to monitor the output
$monitor = Read-Host "`nDo you want to monitor the device output? (y/n)"
if ($monitor -eq 'y' -or $monitor -eq 'Y') {
    Write-Host "`nStarting monitor... (Press Ctrl+] to exit)" -ForegroundColor Cyan
    idf.py -p $selectedPort monitor
}

Write-Host "`nScript completed!" -ForegroundColor Green