@echo off
echo Starting Project...

if not exist venv (
    echo Virtual environment not found. Please run setup_env.bat first.
    pause
    exit /b
)

echo Starting Backend Server...
start "Jewellery Backend" cmd /k "venv\Scripts\activate && python backend\main.py"

echo Starting Frontend Application...
if exist frontend (
    cd frontend
    start "Jewellery Frontend" cmd /k "npm run dev"
    cd ..
) else (
    echo Frontend directory not found!
)

echo Backend and Frontend are launching in new windows.
