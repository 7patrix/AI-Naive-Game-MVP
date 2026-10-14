$ErrorActionPreference = 'Stop'
$projectPath = $PSScriptRoot
$enginePath = 'C:\Users\Administrator\AppData\Local\Programs\Godot\4.7.2-stable\Godot_v4.7.2-stable_win64.exe'
$runtimePath = Join-Path $projectPath '.runtime'
New-Item -ItemType Directory -Force $runtimePath | Out-Null
$env:APPDATA = $runtimePath
& $enginePath --path $projectPath --log-file (Join-Path $projectPath 'evidence\play.log')
