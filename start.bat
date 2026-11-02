@echo off
REM Double-click this file on Windows to run Laksh Quest.
cd /d "%~dp0"
if not exist node_modules (
  echo Installing packages - first time only...
  call npm install
)
echo Starting Laksh Quest... your browser will open in a moment.
start "" cmd /c "timeout /t 3 >nul & start http://localhost:3000"
node server.js
pause
