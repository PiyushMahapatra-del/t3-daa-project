@echo off
echo ========================================
echo  Delivery Optimizer — Starting Server
echo ========================================

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Install from https://python.org
    pause & exit /b 1
)

REM Check Flask
python -c "import flask" >nul 2>&1
if errorlevel 1 (
    echo [INFO] Installing Flask...
    pip install flask
)

REM Check binary
if not exist "bin\optimizer.exe" (
    echo [ERROR] Binary not found. Run build.bat first.
    pause & exit /b 1
)

echo.
echo  Opening browser at http://localhost:5000
echo  Press Ctrl+C to stop
echo.
start "" http://localhost:5000
python app.py
pause
