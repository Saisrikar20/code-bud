# Code-Bud: AI Agent & Tool Execution Architecture

This directory houses the autonomous AI coding agent layer for Code-Bud. It is built on top of [Pydantic AI](https://ai.pydantic.dev/) and provides typed dependency injection, system prompting, dynamic model resolution, and a suite of file and execution tools.

---

## 🏗️ Architecture Overview

The `agents/` layer is intentionally decoupled from the web backend and workspace directories:

```
agents/
├── core.py             # Agent factory, provider config & tool registration
├── context.py          # AgentDeps dependency model & runtime state
├── prompts.py          # Master system prompt & tool behavior contracts
├── __init__.py         # Package exports
└── functions/          # Modular tool functions
    ├── write.py        # File creation & overwriting
    ├── read.py         # File inspection with windowing & line limits
    ├── edit.py         # Surgical find-and-replace editing
    ├── ls.py           # Directory listing with depth filtering
    ├── grep.py         # Workspace-wide text & regex searching
    ├── find.py         # Glob pattern filename searching
    ├── bash.py         # Sandboxed terminal command execution
    └── __init__.py     # Function exports
```

---

## 🧠 Core Agent Components

### 1. Agent Factory (`agents/core.py`)
`create_agent(model_name: str | None = None) -> Agent[AgentDeps]`

- Dynamically selects and instantiates LLM backends:
  - **NVIDIA NIM Models**: Configures `OpenAIChatModel` pointing to `https://integrate.api.nvidia.com/v1` with the `NVIDIA_API_KEY`. Recommended: `z-ai/glm-5.3-flash`, `meta/llama-3.3-70b-instruct`.
  - **Groq & Standard Providers**: Automatically routes standard models like `groq:llama-3.3-70b-versatile` or `openai:gpt-4o`.
- Injects `AgentDeps` as the strongly-typed dependency container.
- Registers tool functions wrapped with `Tool(..., takes_ctx=True)`.

### 2. Runtime Context (`agents/context.py`)
The agent receives an instance of `AgentDeps` on every run:

```python
from dataclasses import dataclass, field

@dataclass
class AgentDeps:
    workspace_dir: str
    session_id: str = "default"
    modified_files: list[str] = field(default_factory=list)
```

- `workspace_dir`: Absolute path to the isolated directory (`user_files/`). All file operations validate that target paths remain strictly inside this root.
- `modified_files`: Tool functions record any files created or modified here. The streaming backend reports these files back to the UI in the `done` event so the editor can refresh the file tree and active tab.

### 3. Prompting Contract (`agents/prompts.py`)
The system prompt establishes explicit behavioral contracts:
- **Always use tools**: When asked to create, edit, or check code, call the appropriate tool rather than only displaying text blocks in chat.
- **Complete code**: The agent writes full, working implementations without placeholders like `// TODO: add code here`.
- **Workspace boundaries**: The agent works exclusively with relative paths inside `user_files/`.

---

## 🛠️ Tool Functions (`agents/functions/`)

Each tool is implemented in a separate module under `agents/functions/`, accepting `RunContext[AgentDeps]` as its first parameter:

| Tool | Module | Description & Signature |
|---|---|---|
| `write` | [`write.py`](file:///G:/ai-agent-devs/code-bud/agents/functions/write.py) | **Writes or overwrites a complete file**.<br>`write(ctx, file_path: str, content: str) -> str`<br>• Auto-creates parent directories.<br>• Validates that `file_path` resolves inside `workspace_dir`.<br>• Records the relative path in `ctx.deps.modified_files`. |
| `read` | [`read.py`](file:///G:/ai-agent-devs/code-bud/agents/functions/read.py) | **Reads text files with pagination support**.<br>`read(ctx, file_path: str, offset: int = 1, limit: int = 200) -> str`<br>• Reads up to `limit` lines starting from `offset`.<br>• Protects against loading massive binary files into agent context. |
| `edit` | [`edit.py`](file:///G:/ai-agent-devs/code-bud/agents/functions/edit.py) | **Surgical find-and-replace**.<br>`edit(ctx, file_path: str, old_string: str, new_string: str) -> str`<br>• Requires `old_string` to exist uniquely in the target file.<br>• Replaces only the specified block to avoid rewriting large files.<br>• Records changes in `ctx.deps.modified_files`. |
| `ls` | [`ls.py`](file:///G:/ai-agent-devs/code-bud/agents/functions/ls.py) | **Lists workspace files and subdirectories**.<br>`ls(ctx, path: str = ".", max_depth: int = 3) -> str`<br>• Formats a clean directory tree.<br>• Ignores `.venv`, `__pycache__`, `.git`, and cache artifacts. |
| `grep` | [`grep.py`](file:///G:/ai-agent-devs/code-bud/agents/functions/grep.py) | **Searches file contents using regular expressions**.<br>`grep(ctx, pattern: str, path: str = ".", max_results: int = 50) -> str`<br>• Returns file paths, line numbers, and matching lines. |
| `find` | [`find.py`](file:///G:/ai-agent-devs/code-bud/agents/functions/find.py) | **Finds files matching a glob pattern**.<br>`find(ctx, pattern: str, path: str = ".") -> str`<br>• Fast pattern matching across files and directories. |
| `bash` | [`bash.py`](file:///G:/ai-agent-devs/code-bud/agents/functions/bash.py) | **Executes shell commands in the workspace**.<br>`bash(ctx, command: str, timeout: int = 30) -> str`<br>• Runs subprocess commands with `cwd=workspace_dir`.<br>• Enforces timeouts and captures stdout and stderr. |

---

## ⚡ Streaming & Tool Execution Lifecycle

When a user sends a message through `POST /api/chat/stream`:

1. **Request Intake**:
   - The backend validates the prompt and conversation history.
   - `get_agent_deps()` resolves `user_files/` as the active workspace.
2. **Execution Loop**:
   - `agent.run_stream(...)` initiates the model inference call.
   - The LLM streams delta tokens as SSE chunks:
     ```
     data: {"type": "chunk", "content": "I am creating add.py..."}
     ```
3. **Tool Invocation**:
   - When the LLM decides to call a tool (e.g. `write("add.py", "def add(a, b): ...")`), Pydantic AI intercepts the call, invokes the tool function against `AgentDeps`, and appends the file to `modified_files`.
4. **Completion**:
   - Once all tool steps finish and the final response finishes streaming, an SSE `done` event is sent:
     ```
     data: {"type": "done", "modified_files": ["add.py"]}
     ```
   - The frontend intercepts `modified_files`, automatically refreshing the file explorer and loading the new file into the editor.

---

## 🧩 Adding a New Tool

To add a new tool to the agent:

1. Create a new module inside `agents/functions/` (e.g., `agents/functions/format_code.py`):
   ```python
   from pydantic_ai import RunContext
   from ..context import AgentDeps

   def format_code(ctx: RunContext[AgentDeps], file_path: str) -> str:
       """Format code using a linter/formatter."""
       workspace = ctx.deps.workspace_dir
       # ... implement logic ...
       return f"Formatted {file_path}"
   ```
2. Export the function in `agents/functions/__init__.py`.
3. Register the tool in `agents/core.py`:
   ```python
   from .functions import format_code

   # In create_agent():
   tools=[
       ...,
       Tool(format_code, takes_ctx=True),
   ]
   ```
4. Restart the backend. The agent will immediately understand when and how to call your new tool.
