@echo off
cd /d "%~dp0"
echo Installing/checking all backend dependencies from requirements.txt...
python -c "import flask, flask_cors, pandas, numpy, sklearn, joblib, dotenv, requests, pywebpush" >nul 2>&1
if errorlevel 1 (
  echo One or more backend packages are missing. Installing the declared requirements...
  python -m pip install -r requirements.txt
  if errorlevel 1 (
    echo Dependency installation failed. Check Python and network access, then retry.
    pause
    exit /b 1
  )
) else (
  echo Backend dependencies are already available.
)
cd /d "%~dp0app"
echo Starting CommunitySignal AI backend at http://127.0.0.1:5000
python -X utf8 app.py
pause
