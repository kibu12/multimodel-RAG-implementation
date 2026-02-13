@echo off
setlocal
echo ==========================================
echo       Jewellery Project Backend Setup
echo ==========================================

cd /d "%~dp0"

REM 1. Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH.
    echo Please install Python 3.10+ and try again.
    pause
    exit /b
)

REM 2. Check/Create Virtual Environment
if not exist venv (
    echo [INFO] Creating Python virtual environment...
    python -m venv venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create venv.
        pause
        exit /b
    )
)

REM 3. Activate and Install Dependencies
echo [INFO] Activating venv...
call venv\Scripts\activate

echo [INFO] Upgrading pip...
python -m pip install --upgrade pip

echo [INFO] Installing python-dotenv...
pip install python-dotenv

echo [INFO] Installing requirements.txt...
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b
)

REM 4. Start Backend
echo.
echo [INFO] Starting Backend Server...
echo [INFO] Server will run at: http://localhost:8000
echo.
python backend/main.py

if %errorlevel% neq 0 (
    echo [ERROR] Backend server crashed.
    pause
)
pause
