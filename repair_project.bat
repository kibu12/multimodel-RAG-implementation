@echo off
global
echo ==========================================
echo      JEWELLERY PROJECT REPAIR TOOL
echo ==========================================
echo.
echo Stopping any running backend processes...
taskkill /F /IM python.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1

echo.
echo 1. Checking Virtual Environment...
if exist venv (
    echo    Found existing 'venv'.
    echo    Renaming old venv to 'venv_old_backup'...
    if exist venv_old_backup rmdir /s /q venv_old_backup
    move venv venv_old_backup
)

echo.
echo 2. Creating New Virtual Environment...
python -m venv venv
if not exist venv (
    echo    ERROR: Failed to create venv. Check Python installation.
    pause
    exit /b
)
echo    Success!

echo.
echo 3. Installing Backend Dependencies...
echo    (This may take a few minutes for Torch/Transformers...)
call venv\Scripts\activate
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo    ERROR: Failed to install dependencies.
    pause
    exit /b
)
echo    Success!

echo.
echo 4. Installing Frontend Dependencies...
if exist frontend\node_modules (
    echo    Frontend modules already exist. Skipping.
) else (
    cd frontend
    call npm install
    cd ..
)

echo.
echo ==========================================
echo      REPAIR COMPLETE!
echo ==========================================
echo.
echo You can now run 'run_project.bat' again.
pause
