@echo off
setlocal enabledelayedexpansion

:: Change directory to project root
cd /d "%~dp0\.."

echo =======================================================
echo         Code-Bud IDE: Participant Setup Script
echo =======================================================
echo.

:: 1. Check Python
where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python is not found in your PATH!
    echo Please install Python 3.12+ from https://www.python.org/
    echo Remember to check "Add Python to PATH" during installation.
    pause
    exit /b 1
)

for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set PY_VER=%%v
echo [*] Detected Python version: %PY_VER%

:: 2. Check or install uv
where uv >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [*] Installing Astral 'uv' package manager...
    powershell -ExecutionPolicy ByPass -Command "irm https://astral.sh/uv/install.ps1 | iex"
    set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
    set "PATH=%LOCALAPPDATA%\bin;%PATH%"
)

where uv >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [*] Falling back to pip install uv...
    python -m pip install uv
)

:: 3. Run uv sync
echo [*] Installing project dependencies with uv...
uv sync
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to synchronize dependencies!
    pause
    exit /b 1
)

:: 4. Install internal shared package
echo [*] Linking internal packages...
uv pip install -e packages/shared
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to install packages/shared!
    pause
    exit /b 1
)

:: 5. Create .env if not present
if not exist ".env" (
    echo [*] Creating .env from .env.example...
    copy .env.example .env >nul
    copy .env.example packages\.env >nul
    echo.
    echo [ACTION REQUIRED] Please edit the .env file and paste your NVIDIA or Groq API key!
) else (
    echo [*] .env already exists.
)

echo.
echo =======================================================
echo           Setup Completed Successfully!
echo =======================================================
echo.
echo Next Steps:
echo 1. Open .env and ensure your API key is configured.
echo 2. Start the application:
echo      uv run python run.py
echo 3. Open in your browser:
echo      http://127.0.0.1:8000
echo.
pause
