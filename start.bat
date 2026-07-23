@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   Solar Calculator v2 - Starting Server
echo ============================================

if not exist node_modules (
    echo Installing dependencies, please wait...
    call npm install
)

start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"

node server.js

echo.
echo Server stopped.
pause
