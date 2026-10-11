#!/usr/bin/env bash
set -e

echo "======================================================="
echo "       Code-Bud IDE: Participant Setup Script"
echo "======================================================="
echo ""

# 1. Check Python
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] python3 is not found in your PATH!"
    echo "Please install Python 3.12+ (e.g. brew install python@3.12 or apt install python3.12)"
    exit 1
fi

PY_VER=$(python3 --version)
echo "[*] Detected: $PY_VER"

# 2. Check or install uv
if ! command -v uv &> /dev/null; then
    echo "[*] Installing Astral 'uv' package manager..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.cargo/bin:$PATH"
    export PATH="$HOME/.local/bin:$PATH"
fi

if ! command -v uv &> /dev/null; then
    echo "[*] Falling back to pip install uv..."
    python3 -m pip install uv
fi

# 3. Synchronize dependencies
echo "[*] Synchronizing dependencies with uv..."
uv sync

# 4. Link internal package
echo "[*] Linking internal packages..."
uv pip install -e packages/shared

# 5. Create .env if not present
if [ ! -f ".env" ]; then
    echo "[*] Creating .env from .env.example..."
    cp .env.example .env
    cp .env.example packages/.env
    echo ""
    echo "[ACTION REQUIRED] Please edit the .env file and paste your NVIDIA or Groq API key!"
else
    echo "[*] .env already exists."
fi

echo ""
echo "======================================================="
echo "          Setup Completed Successfully!"
echo "======================================================="
echo ""
echo "Next Steps:"
echo "1. Open .env and ensure your API key is configured."
echo "2. Start the application:"
echo "     uv run python run.py"
echo "3. Open in your browser:"
echo "     http://127.0.0.1:8000"
echo ""
