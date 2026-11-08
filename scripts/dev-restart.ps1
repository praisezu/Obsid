# Dev helper: restarts Discord Stable with the remote debugging port open (for scripts/cdp.js).
#   powershell -ExecutionPolicy Bypass -File scripts\dev-restart.ps1
# Restart Discord normally afterwards to close the debug port.
Get-Process Discord -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
$base = Join-Path $env:LOCALAPPDATA "Discord"
$app = Get-ChildItem $base -Directory -Filter "app-*" | Sort-Object Name -Descending | Select-Object -First 1
Start-Process (Join-Path $app.FullName "Discord.exe") -ArgumentList "--remote-debugging-port=9223" | Out-Null
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    try { Invoke-WebRequest http://127.0.0.1:9223/json -UseBasicParsing -TimeoutSec 2 | Out-Null; break } catch { }
}
Start-Sleep -Seconds 12  # let Discord finish loading
Write-Host "Discord restarted with debugging on port 9223"
