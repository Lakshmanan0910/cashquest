@echo off
REM Double-click this file on Windows to run CashQuest.
cd /d "%~dp0"
if not exist node_modules (
  echo Installing packages - first time only...
  call npm install
)
echo Starting CashQuest... your browser will open in a moment.
start "" cmd /c "timeout /t 3 >nul & start http://localhost:3000"
node server.js
pause
