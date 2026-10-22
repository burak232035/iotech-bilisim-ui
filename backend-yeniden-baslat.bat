@echo off
REM Sadece test backend'ini (3002) yeniden baslatir. Once drone'un yerde oldugundan emin olun.
cd /d "%~dp0"
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3002 " ^| findstr LISTENING') do taskkill /PID %%p /F >nul 2>&1
start "Drone Backend (test 3002)" cmd /k npm run start:test
