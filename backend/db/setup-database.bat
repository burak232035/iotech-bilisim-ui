@echo off
echo PostgreSQL Database Setup
echo ==========================
echo.

REM PostgreSQL yolunu ayarla (sürümünüze göre değiştirin)
set PGBIN=C:\Program Files\PostgreSQL\15\bin
set PGUSER=postgres
set PGDATABASE=postgres

echo 1. Creating database...
"%PGBIN%\psql.exe" -U %PGUSER% -d %PGDATABASE% -c "CREATE DATABASE drone_tracking;"

if %ERRORLEVEL% NEQ 0 (
    echo Database zaten mevcut olabilir, devam ediyoruz...
)

echo.
echo 2. Running schema...
"%PGBIN%\psql.exe" -U %PGUSER% -d drone_tracking -f "%~dp0init.sql"

echo.
echo Setup completed!
pause
