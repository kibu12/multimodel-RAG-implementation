@echo off
echo Setting up project environment...

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Python is not installed or not in PATH. Please install Python.
    pause
    exit /b
)

REM Create virtual environment
if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
) else (
    echo Virtual environment already exists.
)

REM Activate virtual environment
call venv\Scripts\activate

REM Upgrade pip
echo Upgrading pip...
python -m pip install --upgrade pip

REM Install backend dependencies
if exist requirements.txt (
    echo Installing backend dependencies...
    pip install -r requirements.txt
) else (
    echo Warning: requirements.txt not found.
)

REM Install frontend dependencies
if exist frontend (
    echo Installing frontend dependencies...
    cd frontend
    if exist package.json (
        call npm install
    ) else (
        echo Warning: package.json not found in frontend directory.
    )
    cd ..
) else (
    echo Warning: frontend directory not found.
)

echo Setup complete!
pause
