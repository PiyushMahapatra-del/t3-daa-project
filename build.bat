@echo off
echo ========================================
echo  Delivery Optimizer — Build Script
echo ========================================

REM Check cmake
cmake --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] cmake not found. Install from https://cmake.org/download/
    pause & exit /b 1
)

REM Check g++ / mingw
g++ --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] g++ not found. Install MinGW-w64 or MSVC.
    echo Download: https://winlibs.com/
    pause & exit /b 1
)

echo [1/3] Configuring CMake...
cd cpp
cmake -B ../build -G "MinGW Makefiles" -DCMAKE_BUILD_TYPE=Release
if errorlevel 1 ( echo [ERROR] CMake config failed. & cd .. & pause & exit /b 1 )

echo [2/3] Building C++ binary...
cmake --build ../build --config Release
if errorlevel 1 ( echo [ERROR] Build failed. & cd .. & pause & exit /b 1 )

cd ..
echo [3/3] Binary ready at: bin\optimizer.exe
echo.
echo ========================================
echo  Build complete!
echo  Run:  run.bat
echo ========================================
pause
