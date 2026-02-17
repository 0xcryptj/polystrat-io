@echo off
setlocal

cd /d "%~dp0"

REM Always kill old instances first to avoid EADDRINUSE
call "%~dp0Kill All Bot Instances.bat"

REM Install deps if missing
if not exist node_modules (
  echo Installing dependencies...
  npm install
)

echo Starting Polymarket Bot GUI on http://127.0.0.1:3188
REM Stable mode (no watch restarts)
start "Polymarket Bot" cmd /c "npm run prod"

endlocal
