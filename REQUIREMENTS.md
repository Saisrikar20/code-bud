# Code-Bud: Comprehensive System Requirements & Deployment Procedure

This document defines the complete technical specifications, hardware and runtime prerequisites, environment configurations, operational procedures, and verification protocols for deploying and running **Code-Bud** in a self-contained local environment.

> [!NOTE]
> This deployment procedure is entirely self-contained and operates directly from the local project directory without requiring any connection to an external Git repository.
> 
> **For Participants / Workshop Attendees receiving a `.zip` archive:** See [PARTICIPANT_SETUP_GUIDE.md](PARTICIPANT_SETUP_GUIDE.md) for pre-installing Python 3.12 & `uv` before extracting, as well as 1-click automated setup scripts (`setup.bat` for Windows, `setup.sh` for macOS/Linux).

---

## 1. System & Hardware Specifications

### 1.1 Supported Operating Systems
| Operating System | Supported Versions | Notes |
|---|---|---|
| **Windows** | Windows 10 (64-bit), Windows 11 (64-bit), Windows Server 2022+ | Fully supported. Uses `cmd.exe` / `powershell.exe` for terminal execution. |
| **Linux** | Ubuntu 22.04 LTS+, Debian 12+, Fedora 38+, Arch Linux | Fully supported. Requires standard POSIX shell (`bash` / `sh`). |
| **macOS** | macOS 12 (Monterey), 13 (Ventura), 14 (Sonoma)+ | Fully supported (Apple Silicon & Intel x86_64). |

### 1.2 Minimum vs. Recommended Hardware
| Component | Minimum Specification | Recommended Specification |
|---|---|---|
| **Processor (CPU)** | 2 Cores (x86_64 or ARM64) | 4+ Cores (x86_64 or Apple Silicon) |
| **Memory (RAM)** | 4 GB | 8 GB or higher |
| **Storage (Disk)** | 1 GB free space (including Python venv & dependencies) | 5 GB free SSD space |
| **Network** | Outbound HTTPS connectivity (Port 443) to LLM API provider | Stable low-latency Internet connection |

---

## 2. Software Runtime & Dependency Specifications

### 2.1 Python Runtime
- **Required Version**: Python `>= 3.12.0` (tested with Python 3.12.x).
- **Verification Command**:
  ```bash
  python --version
  # Expected output: Python 3.12.x (or higher)
  ```

### 2.2 Package Management Tool
- **Primary Tool**: [Astral `uv`](https://docs.astral.sh/uv/) (Recommended for ultra-fast deterministic resolution).
- **Alternative Tool**: Standard Python `pip` and `venv` (Supported).
- **Verification Command**:
  ```bash
  uv --version
  # Expected output: uv 0.4.x (or higher)
  ```

### 2.3 Frontend Tooling (Optional)
- **Node.js**: `>= 18.0.0` (Only needed if modifying and recompiling TypeScript source files in `frontend/src/`).
- Pre-bundled distributions are already compiled in `frontend/dist/main.js`, allowing direct execution without Node.js.

---

## 3. Directory & File Integrity Requirements

The system must strictly comply with the following 5-part architecture:

```
code-bud/
├── packages/              # [Component 1] Configurations, lockfiles & shared models
│   ├── .env               # Private runtime secrets and API keys
│   ├── .env.example       # Example environment template
│   ├── pyproject.toml     # Root workspace configuration
│   ├── uv.lock            # Exact dependency lockfile
│   └── shared/            # Shared Pydantic data schemas and config parser
│       └── src/shared/
│           ├── config.py
│           ├── models.py
│           └── __init__.py
│
├── frontend/              # [Component 2] Web client UI & assets
│   ├── index.html         # Chrome UI with tabs, editor, chat, & output panels
│   ├── css/style.css      # SaaS styling
│   ├── src/               # TypeScript modules
│   └── dist/main.js       # Production bundle served by FastAPI
│
├── backend/               # [Component 3] FastAPI application & service routers
│   ├── main.py            # FastAPI application factory & static mounts
│   ├── dependencies.py    # Workspace resolver and dependency injection
│   └── routes/
│       ├── chat.py        # /api/chat & /api/chat/stream (SSE)
│       ├── files.py       # /api/files CRUD, execution & deletion endpoints
│       ├── terminal.py    # /api/terminal command runner
│       └── health.py      # /api/health monitoring
│
├── agents/                # [Component 4] Autonomous AI agent layer
│   ├── README.md          # Dedicated agent and tools documentation
│   ├── core.py            # Pydantic AI agent instance & model router
│   ├── context.py         # AgentDeps runtime state contract
│   ├── prompts.py         # Behavioral prompt contracts
│   └── functions/         # Dedicated tool functions directory
│       ├── write.py       # File creation & overwriting
│       ├── read.py        # File reading with line pagination
│       ├── edit.py        # Targeted surgical search-and-replace
│       ├── ls.py          # Directory listing with recursion depth control
│       ├── grep.py        # Workspace text & regex search
│       ├── find.py        # File pattern matching
│       └── bash.py        # Sandboxed shell command runner
│
├── user_files/            # [Component 5] Isolated user and AI workspace
│   └── (Contains all created, uploaded, and agent-generated source files)
│
└── run.py                 # Root application launcher script
```

---

## 4. Environment & API Key Specifications

### 4.1 Required Environment Variables
The application reads configuration from a local `.env` file at the root or within `packages/`.

| Variable | Required | Description | Example Values |
|---|---|---|---|
| `NVIDIA_API_KEY` | Conditional | API key for NVIDIA NIM inference | `nvapi-xxxxxxxxxxxxxxxxxxxxxxxx` |
| `GROQ_API_KEY` | Conditional | API key for Groq Cloud inference | `gsk_xxxxxxxxxxxxxxxxxxxxxxxx` |
| `OPENAI_API_KEY` | Conditional | API key for OpenAI inference | `sk-proj-xxxxxxxxxxxxxxxxxxxx` |
| `AGENT_MODEL` | Optional | Model identifier to use (Defaults to `nvidia:z-ai/glm-5.3-flash`) | `nvidia:z-ai/glm-5.3-flash`, `groq:llama-3.3-70b-versatile`, `openai:gpt-4o` |
| `HOST` | Optional | Host IP address to bind (Defaults to `127.0.0.1`) | `127.0.0.1`, `0.0.0.0` |
| `PORT` | Optional | Port to listen on (Defaults to `8000`) | `8000`, `8080`, `3000` |
| `USER_FILES_DIR` | Optional | Custom workspace directory path (Defaults to `./user_files`) | `G:\ai-agent-devs\code-bud\user_files` |

> [!IMPORTANT]
> At least **one** valid LLM API key (`NVIDIA_API_KEY`, `GROQ_API_KEY`, or `OPENAI_API_KEY`) must be configured for the autonomous AI agent to function.

---

## 5. Step-by-Step Installation & Setup Procedure

Follow these procedures in sequence to initialize the application in a local workspace:

### Procedure 5.1: Directory & Environment Verification
1. Open your terminal and navigate to the project directory:
   ```bash
   cd code-bud
   ```
2. Verify that Python 3.12+ is accessible:
   ```bash
   python --version
   ```
3. Verify that the 5 required directories exist:
   ```bash
   # Windows PowerShell:
   Test-Path packages, frontend, backend, agents, user_files

   # Linux / macOS:
   ls -d packages frontend backend agents user_files
   ```

### Procedure 5.2: Virtual Environment & Dependency Installation
#### Method A: Using Astral `uv` (Recommended)
1. Synchronize project dependencies:
   ```bash
   uv sync
   ```
2. Install the local `shared` package in editable mode:
   ```bash
   uv pip install -e packages/shared
   ```

#### Method B: Using Standard Python `venv` & `pip`
1. Create a virtual environment:
   ```bash
   python -m venv .venv
   ```
2. Activate the virtual environment:
   - **Windows PowerShell**:
     ```powershell
     .\.venv\Scripts\Activate.ps1
     ```
   - **Windows Command Prompt**:
     ```cmd
     .\.venv\Scripts\activate.bat
     ```
   - **Linux / macOS**:
     ```bash
     source .venv/bin/activate
     ```
3. Install required packages:
   ```bash
   pip install fastapi uvicorn pydantic-ai groq
   pip install -e packages/shared
   ```

### Procedure 5.3: Environment File Configuration
1. Create a `.env` file in the project root:
   ```bash
   # Windows PowerShell:
   Copy-Item .env.example .env

   # Linux / macOS:
   cp .env.example .env
   ```
2. Open `.env` in any text editor and provide your API key:
   ```ini
   NVIDIA_API_KEY=nvapi-your-key-here
   AGENT_MODEL=nvidia:z-ai/glm-5.3-flash
   HOST=127.0.0.1
   PORT=8000
   ```
3. Also replicate the file into `packages/.env` for package isolation:
   ```bash
   # Windows PowerShell:
   Copy-Item .env packages\.env -Force

   # Linux / macOS:
   cp .env packages/.env
   ```

### Procedure 5.4: Frontend Verification (Optional Rebuild)
The pre-bundled distribution [`frontend/dist/main.js`](file:///G:/ai-agent-devs/code-bud/frontend/dist/main.js) is ready for immediate deployment. If you wish to recompile from source:
```bash
cd frontend
npm install
npx esbuild src/main.ts --bundle --outfile=dist/main.js
cd ..
```

---

## 6. Execution & Startup Procedures

### Procedure 6.1: Launching the Application
Execute the primary entry point script from the project root:

```bash
# With uv:
uv run python run.py

# Or with activated virtualenv:
python run.py
```

Expected terminal output:
```
[*] Starting Code-Bud Antigravity IDE on http://127.0.0.1:8000
INFO:     Started server process [PID]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

### Procedure 6.2: Accessing the Web Interface
1. Launch any modern Chromium, Firefox, or Safari browser.
2. Navigate to:
   ```
   http://127.0.0.1:8000
   ```
3. The IDE workspace will display:
   - **Left Pane**: File Explorer (root: `USER_FILES`)
   - **Center Pane**: Tabbed Code Editor with Line Numbers, Minimap, and Diagnostics
   - **Right Pane**: Interactive AI Chat Assistant with Model Selector
   - **Bottom Pane**: Execution Output Console with Duration & Exit Code Tracking

---

## 7. Quality Assurance & Verification Protocols

Execute these verification checks to confirm full system operational readiness.

### Protocol 7.1: Health & Workspace Probe
Verify the backend status and workspace resolution:

```bash
# PowerShell:
Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/files/info" | ConvertTo-Json

# Linux / macOS:
curl -s http://127.0.0.1:8000/api/files/info
```

**Pass Criteria**:
- HTTP Status `200 OK`.
- `name` matches `"USER_FILES"`.
- `workspace_root` points to the absolute path of `<project-root>/user_files`.

### Protocol 7.2: File Creation & Deletion
Verify file management within `user_files/`:

```bash
# 1. Create a file
curl -X POST http://127.0.0.1:8000/api/files/save \
  -H "Content-Type: application/json" \
  -d '{"path": "test_verify.py", "content": "print(42)"}'

# 2. Check file tree
curl -s http://127.0.0.1:8000/api/files/tree

# 3. Clean up file
curl -X DELETE "http://127.0.0.1:8000/api/files/delete?path=test_verify.py"
```

**Pass Criteria**:
- HTTP Status `200 OK` on all requests.
- File appears in `tree` and is removed upon deletion.

### Protocol 7.3: Code Execution Runner
Verify in-process script execution:

```bash
# Create hello test
curl -X POST http://127.0.0.1:8000/api/files/save \
  -H "Content-Type: application/json" \
  -d '{"path": "hello.py", "content": "print(\"System Operational\")"}'

# Execute script
curl -X POST http://127.0.0.1:8000/api/files/run \
  -H "Content-Type: application/json" \
  -d '{"path": "hello.py"}'
```

**Pass Criteria**:
- `exit_code: 0`.
- `stdout: "System Operational\n"`.
- `duration_seconds` is recorded.

### Protocol 7.4: Autonomous Agent Streaming & Tool Call
Verify AI pair-programming agent inference and autonomous tool execution:

```bash
curl -X POST http://127.0.0.1:8000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "Write a python file named add.py that defines add(a,b) and prints add(5, 7)"}'
```

**Pass Criteria**:
- Response streams Server-Sent Events (`data: {"type": "chunk", ...}`).
- Agent autonomously invokes `write` function.
- Emits final event `data: {"type": "done", "modified_files": ["add.py"]}`.
- File `user_files/add.py` exists on disk with full code.

---

## 8. Security & Sandboxing Policies

1. **Path Traversal Confinement**:
   - Every file operation (`write`, `read`, `edit`, `delete`, `run`) checks:
     `os.path.commonpath([target_path, abs_workspace]) == abs_workspace`
   - Any attempt to access files outside `user_files/` (e.g. `../../etc/passwd` or `..\..\Windows\system32`) is intercepted and rejected with HTTP `403 Forbidden`.

2. **Execution Timeouts**:
   - The in-browser execution runner (`POST /api/files/run`) enforces a hard timeout of `30 seconds` to protect against infinite loops.
   - Interactive commands requiring unbounded runtime must be launched via the native console (`POST /api/files/run-terminal`).

3. **Secret Isolation**:
   - API keys are read from environment variables or local `.env`.
   - `.gitignore` explicitly prevents `.env`, `**/.env`, and credential logs from entering version control.

---

## 9. Troubleshooting & Remediation Matrix

| Symptom / Error | Root Cause | Remediation Procedure |
|---|---|---|
| `ModuleNotFoundError: No module named 'shared'` | Shared package was not installed in editable mode. | Run `uv pip install -e packages/shared` (or `pip install -e packages/shared`). |
| `Address already in use [Errno 10048]` | Port 8000 is occupied by a previously running process. | Run `Get-Process python \| Stop-Process -Force` (Windows) or `killall python` (Linux/macOS), or specify a different port in `.env` (`PORT=8080`). |
| `Error: Cannot write outside workspace` | Attempt to write with absolute or traversing path. | Use relative file paths (e.g., `app.py`, `utils/math.py`) relative to `user_files/`. |
| `pydantic_ai.exceptions.ModelHTTPError: 401 Unauthorized` | Invalid or missing API key in `.env`. | Verify that `NVIDIA_API_KEY` or `GROQ_API_KEY` in `.env` is accurate and has active quota. |
| Browser shows blank white screen | Frontend bundle missing or unmounted. | Recompile bundle with `npx esbuild frontend/src/main.ts --bundle --outfile=frontend/dist/main.js`. |
| Run button shows no output | Execution produced no stdout/stderr or timed out. | Check the file content to verify it contains print statements and has no blocking input prompts. |
