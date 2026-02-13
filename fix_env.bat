@echo off
echo Starting environment fix... > fix_log.txt
python --version >> fix_log.txt 2>&1
echo Creating venv_new... >> fix_log.txt
python -m venv venv_new >> fix_log.txt 2>&1
if exist venv_new (
    echo venv_new created successfully. >> fix_log.txt
    venv_new\Scripts\pip install -r requirements.txt >> fix_log.txt 2>&1
) else (
    echo Failed to create venv_new. >> fix_log.txt
)
echo Fix complete. >> fix_log.txt
