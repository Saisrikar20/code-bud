# Participant Setup Guide: Code-Bud IDE & AI Agent
### Complete Step-by-Step Installation Procedure (Zip Distribution)

> [!IMPORTANT]
> **To the Participant:** You will receive the project as a `.zip` archive (`code-bud.zip`). You do **not** need Git or a GitHub account. Follow this guide to prepare your computer with the necessary runtimes and dependencies so you can extract and run Code-Bud instantly.

---

## 📋 Quick Checklist Before You Begin

| Step | Task | Done? |
|---|---|:---:|
| **Step 1** | Install Python 3.12 (Check "Add Python to PATH" on Windows) | [ ] |
| **Step 2** | Install `uv` (Fast package manager) | [ ] |
| **Step 3** | Get your free LLM API Key (NVIDIA NIM or Groq) | [ ] |
| **Step 4** | Extract `code-bud.zip` to a clean folder | [ ] |
| **Step 5** | Install dependencies & configure `.env` | [ ] |
| **Step 6** | Run the application: `uv run python run.py` | [ ] |

---

## 🛠️ Step 1: Install Python 3.12 (Pre-Requisite)

The application requires **Python 3.12 or newer**.

### On Windows
1. Download the official installer from Python.org:
   - **Download Link**: [Python 3.12 Windows 64-bit Installer](https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe)
2. Run the downloaded installer `.exe`.
3. > [!CAUTION]
   > **CRITICAL STEP:** On the very first screen of the installer, you **MUST CHECK THE BOX**:
   > `☑ Add python.exe to PATH` (at the bottom of the window).
4. Click **Install Now**.
5. Once installation finishes, click **Disable path length limit** if prompted, then click **Close**.
6. **Verify installation:**
   Open PowerShell or Command Prompt and run:
   ```powershell
   python --version
   ```
   *Expected output:* `Python 3.12.x`

> [!TIP]
> **Windows Microsoft Store Trap:** If typing `python` opens the Microsoft Store, open Windows Settings > search **"Manage app execution aliases"** > toggle **OFF** both `python.exe` and `python3.exe`.

---

### On macOS
1. Open the **Terminal** app.
2. If you have **Homebrew** installed:
   ```bash
   brew install python@3.12
   ```
3. If you do not have Homebrew, download the official installer:
   - [Python 3.12 macOS 64-bit Universal Installer](https://www.python.org/ftp/python/3.12.8/python-3.12.8-macos11.pkg)
   - Double-click the `.pkg` file and follow the on-screen installer prompts.
4. **Verify installation:**
   ```bash
   python3 --version
   ```
   *Expected output:* `Python 3.12.x`

---

### On Linux (Ubuntu / Debian)
1. Open your terminal and run:
   ```bash
   sudo apt update
   sudo apt install -y python3.12 python3.12-venv python3.12-dev python3-pip curl
   ```
2. **Verify installation:**
   ```bash
   python3 --version
   ```

---

## ⚡ Step 2: Install `uv` (Recommended Fast Package Manager)

We use Astral `uv`, an extremely fast Python package manager that handles dependencies in seconds.

### On Windows (PowerShell)
Open PowerShell (Win + X -> Terminal or search PowerShell) and run:
```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```
After installation, **close and reopen your PowerShell window**, then verify:
```powershell
uv --version
```
*Expected output:* `uv 0.5.x` (or newer).

*(Alternative via pip if the script is blocked by corporate policy):*
```powershell
pip install uv
```

---

### On macOS & Linux (Terminal)
Open Terminal and run:
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```
Close and reopen your terminal (or run `source $HOME/.cargo/env`), then verify:
```bash
uv --version
```

*(Alternative via pip):*
```bash
pip install uv
```

---

## 🔑 Step 3: Obtain a Free LLM API Key

Code-Bud requires an API key to communicate with AI models. Choose either **NVIDIA NIM** (Recommended) or **Groq**:

### Option A: NVIDIA NIM (Recommended — Fast & Free credits)
1. Visit [https://build.nvidia.com/](https://build.nvidia.com/)
2. Sign in or create a free NVIDIA developer account.
3. Search for the model: **`z-ai/glm-5.3-flash`** or **`meta/llama-3.3-70b-instruct`**.
4. Click **Get API Key** and copy your personal key (starts with `nvapi-...`).

### Option B: Groq Cloud (Free & Ultra-Fast)
1. Visit [https://console.groq.com/keys](https://console.groq.com/keys)
2. Sign in with Google or GitHub.
3. Click **Create API Key** and copy your key (starts with `gsk_...`).

Keep this key copied or saved in a temporary note for Step 5.

---

## 📦 Step 4: Extract the Zip File

1. Locate the `code-bud.zip` file on your computer.
2. **Extract it to a clean path:**
   - **Windows:** Right-click `code-bud.zip` > select **Extract All...** > choose a path without spaces (e.g. `C:\code-bud` or `D:\workshops\code-bud`) > click **Extract**.
   - **macOS / Linux:** Double-click `code-bud.zip` or run:
     ```bash
     unzip code-bud.zip -d ~/code-bud
     ```
3. Open a terminal directly inside the extracted folder:
   - **Windows:** Open the folder in File Explorer, click the address bar, type `powershell` (or `cmd`), and press Enter.
   - **macOS / Linux:** Open Terminal and navigate to the directory:
     ```bash
     cd ~/code-bud
     ```
4. Verify you see the 5 project folders:
   ```
   packages/
   frontend/
   backend/
   agents/
   user_files/
   ```

---

## 🔧 Step 5: Install Project Dependencies & Configure Environment

You can choose between the **Automated Setup** or **Manual Setup**.

### Method 1: One-Click Automated Setup (Fastest)

#### On Windows:
Double-click `docs\setup.bat` (or run it in PowerShell/CMD):
```cmd
.\docs\setup.bat
```

#### On macOS / Linux:
Run the setup shell script in your terminal:
```bash
chmod +x docs/setup.sh
./docs/setup.sh
```

---

### Method 2: Manual Terminal Commands

If you prefer running the commands step-by-step:

#### 1. Synchronize Dependencies with `uv`:
```bash
uv sync
```
*(This automatically creates a high-performance virtual environment `.venv` and installs FastAPI, Uvicorn, Pydantic-AI, etc.)*

#### 2. Install the internal shared package:
```bash
uv pip install -e packages/shared
```

#### 3. Configure your `.env` API Key:
- **Windows PowerShell:**
  ```powershell
  Copy-Item .env.example .env -Force
  ```
- **macOS / Linux:**
  ```bash
  cp .env.example .env
  ```

Open the newly created `.env` file in Notepad or VS Code:
```ini
# Paste your API key here:
NVIDIA_API_KEY=nvapi-your-key-here

# If using Groq instead, leave NVIDIA blank and fill:
# GROQ_API_KEY=gsk_your-key-here

AGENT_MODEL=nvidia:z-ai/glm-5.3-flash
HOST=127.0.0.1
PORT=8000
```
Save and close the file.

---

## 🚀 Step 6: Launch Code-Bud IDE

Once dependencies are installed and `.env` is saved, launch the application:

```bash
uv run python run.py
```

You should see:
```text
[*] Starting Code-Bud Antigravity IDE on http://127.0.0.1:8000
INFO:     Started server process [PID]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

Now open your web browser (Chrome, Edge, Firefox, Brave, Safari) and go to:
👉 **[http://127.0.0.1:8000](http://127.0.0.1:8000)**

---

## 🎮 How to Test that Everything Works

1. **Check the File Explorer (Left Pane)**:
   - You should see `USER_FILES` as the top-level directory.
2. **Test File Creation & Execution**:
   - In the Explorer header, click the **+ New File** icon.
   - Name the file `test.py`.
   - In the editor, type:
     ```python
     print("Hello from Code-Bud!")
     ```
   - Click the green **▶ Run** button at the top right of the editor.
   - Look at the bottom **Console**: it will display `Hello from Code-Bud!` with execution time and exit code `0`.
3. **Test the AI Agent**:
   - In the right-hand **Chat** panel, type:
     > *"Create a file named calculator.py with functions for add, subtract, multiply, divide, and run tests."*
   - Watch the AI agent stream its thoughts and automatically generate `calculator.py` inside your `USER_FILES` tree!
   - Open `calculator.py` and click **▶ Run** to execute the agent's code.

---

## ❓ Troubleshooting Common Participant Issues

### 1. `python` or `uv` is not recognized
- **Cause:** Terminal was opened before installing Python or `uv`, or PATH was not updated.
- **Fix:** Close all open PowerShell / Command Prompt windows and open a fresh one. If Python still isn't found, re-run the Python installer and make sure **"Add python.exe to PATH"** is checked.

### 2. Windows Script Execution Policy Error: `Running scripts is disabled on this system`
- **Cause:** Windows PowerShell prevents running downloaded scripts by default.
- **Fix:** In PowerShell, run:
  ```powershell
  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
  ```
  Then re-run your command.

### 3. Error: `ModuleNotFoundError: No module named 'shared'`
- **Cause:** The internal package was not linked to the virtual environment.
- **Fix:** Run:
  ```bash
  uv pip install -e packages/shared
  ```

### 4. Error: `Address already in use [Errno 10048]` (Port 8000 occupied)
- **Cause:** Another program (or a previous Code-Bud instance) is already using port 8000.
- **Fix:** Open `.env` and change `PORT=8000` to `PORT=8080` (or `PORT=3000`), then restart:
  ```bash
  uv run python run.py
  ```

### 5. AI Chat gives `AuthenticationError (401 Unauthorized)`
- **Cause:** The API key in `.env` is missing, incomplete, or has expired credits.
- **Fix:** Verify your key at [build.nvidia.com](https://build.nvidia.com/) or [console.groq.com](https://console.groq.com/). Open `.env`, ensure there are no extra quotation marks or leading spaces, and restart the server.
