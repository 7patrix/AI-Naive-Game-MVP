$ErrorActionPreference = 'Stop'
$webPath = Join-Path $PSScriptRoot 'exports\web'
Write-Host 'MoonKiller local Web preview: http://127.0.0.1:8765/index.html'
Write-Host 'Loopback only. Press Ctrl+C to stop.'
python -m http.server 8765 --bind 127.0.0.1 --directory $webPath
