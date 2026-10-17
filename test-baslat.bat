@echo off
REM Test ortamini baslatir: backend (3002), dashboard (3010), ortomozaik servisi (8002).
REM Her servis kendi penceresinde calisir; kapatmak icin o pencereyi kapatin.
cd /d "%~dp0"

start "Drone Backend (test 3002)" cmd /k npm run start:test
start "Drone Dashboard (test 3010)" cmd /k npm --prefix drone-frontend-react run dev:test
start "Ortomozaik Servisi (8002)" cmd /k python -m uvicorn --app-dir orthomosaic-service app:app --host 127.0.0.1 --port 8002

echo Servisler aciliyor... Dashboard: http://localhost:3010
timeout /t 8 /nobreak >nul
start "" http://localhost:3010/login
