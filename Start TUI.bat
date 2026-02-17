@echo off
setlocal
cd /d "%~dp0"

REM Ensure deps installed
if not exist node_modules (
  npm install
)

echo Starting TUI (press q to quit)...
npm run tui

endlocal
