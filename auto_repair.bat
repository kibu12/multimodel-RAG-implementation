@echo off
echo Starting Auto-Repair... > auto_repair.log

echo Killing processes... >> auto_repair.log
taskkill /F /IM python.exe >> auto_repair.log 2>&1
taskkill /F /IM node.exe >> auto_repair.log 2>&1

if exist venv (
    echo Removing old venv... >> auto_repair.log
    rmdir /s /q venv >> auto_repair.log 2>&1
)

echo Creating new venv... >> auto_repair.log
python -m venv venv >> auto_repair.log 2>&1

if exist venv (
    echo Installing dependencies... >> auto_repair.log
    venv\Scripts\pip install -r requirements.txt >> auto_repair.log 2>&1
    if %errorlevel% equ 0 (
        echo SUCCESS: Dependencies installed. >> auto_repair.log
    ) else (
        echo ERROR: Install failed. >> auto_repair.log
    )
) else (
    echo ERROR: venv creation failed. >> auto_repair.log
)

echo Repair complete. >> auto_repair.log
