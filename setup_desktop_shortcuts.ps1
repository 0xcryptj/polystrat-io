$ErrorActionPreference='Stop'
$desk=[Environment]::GetFolderPath('Desktop')
$src1=Join-Path $env:USERPROFILE 'Desktop\OpenClaw Gateway (Start).cmd'
$src2=Join-Path $env:USERPROFILE 'Desktop\OpenClaw Dashboard.url'
if(Test-Path $src1){ Copy-Item -Force $src1 (Join-Path $desk 'OpenClaw Gateway (Start).cmd') }
if(Test-Path $src2){ Copy-Item -Force $src2 (Join-Path $desk 'OpenClaw Dashboard.url') }

$w = New-Object -ComObject WScript.Shell

# Dashboard shortcut
$lnk1 = $w.CreateShortcut((Join-Path $desk 'OpenClaw Dashboard.lnk'))
$lnk1.TargetPath = 'http://127.0.0.1:18789/'
$lnk1.IconLocation = "$env:SystemRoot\System32\url.dll,0"
$lnk1.Save()

# Gateway start shortcut
$lnk2 = $w.CreateShortcut((Join-Path $desk 'OpenClaw Gateway (Start).lnk'))
$lnk2.TargetPath = 'cmd.exe'
$cmdPath = (Join-Path $desk 'OpenClaw Gateway (Start).cmd')
$lnk2.Arguments = '/c ""' + $cmdPath + '""'
$lnk2.WorkingDirectory = $desk
$lnk2.IconLocation = "$env:SystemRoot\System32\shell32.dll,137"
$lnk2.Save()

Write-Output "Wrote shortcuts to $desk"
