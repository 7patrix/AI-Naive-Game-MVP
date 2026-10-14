$ErrorActionPreference = 'Stop'
$projectPath = $PSScriptRoot
$enginePath = 'C:\Users\Administrator\AppData\Local\Programs\Godot\4.7.2-stable\Godot_v4.7.2-stable_win64.exe'
$env:APPDATA = Join-Path $projectPath '.runtime'
New-Item -ItemType Directory -Force $env:APPDATA | Out-Null
& $enginePath --editor --path $projectPath --log-file (Join-Path $projectPath 'evidence\editor.log')
