@echo off
setlocal EnableExtensions

echo [Kill] Polymarket-bot: killing anything listening on 127.0.0.1:3188 ...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3188 ^| findstr LISTENING') do (
  echo   - taskkill /PID %%a /T /F
  taskkill /PID %%a /T /F >nul 2>&1
)

echo [Kill] Polymarket-bot: killing node.exe processes started from this folder (best-effort)...
set "ROOT=%~dp0"
for /f "usebackq tokens=2 delims==" %%p in (`powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" ^| Where-Object { $_.CommandLine -and ($_.CommandLine -like ('*' + [Regex]::Escape('%ROOT%') + '*')) } ^| ForEach-Object { $_.ProcessId }"`) do (
  echo   - taskkill /PID %%p /T /F
  taskkill /PID %%p /T /F >nul 2>&1
)

echo [Kill] Done.
endlocal
