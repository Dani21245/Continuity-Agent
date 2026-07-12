@echo off
title Continuity Agent Launcher
echo ===================================================
echo        Starting Continuity Agent Servers
echo ===================================================
echo.

:: Copy logo from Downloads if it exists
if exist "C:\Users\jumal\Downloads\ChatGPT Image Jul 12, 2026, 11_18_29 PM.png" (
    if not exist public mkdir public
    copy "C:\Users\jumal\Downloads\ChatGPT Image Jul 12, 2026, 11_18_29 PM.png" "public\logo.png" > nul
    echo [Assets] Logo updated from Downloads.
)

:: Check node_modules and run npm install if missing
if exist node_modules\ goto skip_install

echo [Frontend] node_modules not found. Running npm install...
call npm install
if errorlevel 1 (
    echo [Error] npm install failed. Please ensure Node.js is installed.
    pause
    exit /b 1
)

:skip_install
echo [Frontend] node_modules found.

:: Start Backend Server in a new window
echo [Backend] Starting FastAPI backend on port 8000...
start "ContinuityBackend" cmd /c ".venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000"

:: Start Frontend Server in a new window
echo [Frontend] Starting Vite frontend server...
start "ContinuityFrontend" cmd /c "npm run dev"

echo.
echo ===================================================
echo  Servers are starting!
echo  - Backend API:       http://localhost:8000
echo  - Interactive Docs:  http://localhost:8000/docs
echo  - React Dashboard:   http://localhost:3000
echo ===================================================
echo.
echo Press any key to exit this launcher window (servers will keep running).
pause > nul
