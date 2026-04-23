param(
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"

$ngrokPath = Join-Path $env:USERPROFILE "tools\ngrok\ngrok.exe"
$configPath = Join-Path $env:USERPROFILE ".ngrok-profiles\fishmap.yml"

if (-not (Test-Path $ngrokPath)) {
    Write-Error "ngrok not found at $ngrokPath"
}

if (-not (Test-Path $configPath)) {
    Write-Error "ngrok profile not found at $configPath"
}

Write-Host "Starting Fishmap tunnel on port $Port..."
& $ngrokPath http --config $configPath $Port
