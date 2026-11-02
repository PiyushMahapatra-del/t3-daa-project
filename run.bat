@echo off
echo ========================================================
echo  LOGIX // Enterprise Logistics Optimizer - Starting Server
echo ========================================================

REM Check Python command
set PY_CMD=python
python --version >nul 2>&1
if errorlevel 1 (
    py --version >nul 2>&1
    if not errorlevel 1 (
        set PY_CMD=py
    ) else if exist "%LOCALAPPDATA%\Python\bin\python.exe" (
        set PY_CMD="%LOCALAPPDATA%\Python\bin\python.exe"
    ) else (
        echo [ERROR] Python not found. Install from https://python.org
        pause & exit /b 1
    )
)

REM Check Flask
%PY_CMD% -c "import flask" >nul 2>&1
if errorlevel 1 (
    echo [INFO] Installing Flask...
    %PY_CMD% -m pip install flask
)

REM Check C++ binary or fallback
if exist "bin\optimizer.exe" (
    echo [INFO] Native C++ binary detected: bin\optimizer.exe
) else (
    echo [INFO] C++ binary not compiled - running in Python Fallback Mode (All algorithms supported).
)

echo.
echo  Opening dashboard at http://localhost:5000
echo  Press Ctrl+C in this console to stop the server
echo.
start "" http://localhost:5000
%PY_CMD% app.py
pause
