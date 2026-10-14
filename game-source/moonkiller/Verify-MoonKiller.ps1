$ErrorActionPreference = 'Stop'
$projectPath = $PSScriptRoot
$enginePath = 'C:\Users\Administrator\AppData\Local\Programs\Godot\4.7.2-stable\Godot_v4.7.2-stable_win64.exe'
$env:APPDATA = Join-Path $projectPath '.runtime'
New-Item -ItemType Directory -Force $env:APPDATA | Out-Null
foreach ($check in @(@('--qa-dialog','dialog_v7\native.log'),@('--qa-first-night','dialog_v7\first_night.log'),@('--qa-experience','dialog_v7\experience.log'),@('--qa-animation','dialog_v7\animation.log'),@('--qa','dialog_v7\legacy.log'),@('--qa-reload','dialog_v7\reload.log'))) {
    $logPath = Join-Path $projectPath ('evidence\'+$check[1])
    $run = Start-Process -FilePath $enginePath -ArgumentList @('--path',('"'+$projectPath+'"'),'--log-file',('"'+$logPath+'"'),'--',$check[0]) -WindowStyle Hidden -Wait -PassThru
    if ($run.ExitCode -ne 0) { throw ($check[0]+' failed. See '+$logPath) }
    Write-Output ($check[0]+' passed')
}
