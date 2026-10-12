# 🎓 AGENT UNBOXED — Presenter & Instructor Curriculum Guide
## AI Agent Workshop: Fundamentals • Architecture • Implementation • Security • Reliability
### Codebase Mapping & Feasibility Guide for Presenters (`code-bud`)

---

## 📌 Executive Summary

The original workshop syllabus was drafted around building a **monolithic Python CLI coding agent** (interactive terminal REPL with commands like `/exit`, `/reset`, `/tools`, `/usage`). 

In contrast, the **`code-bud`** repository has evolved into a production-grade **Full-Stack Autonomous Agent IDE**:
- **Agent Harness**: Powered by **Pydantic AI** with multi-provider LLM routing (NVIDIA NIM, Groq, OpenAI).
- **Tool Suite**: Surgical code manipulation (`write`, `read`, `edit` with unified diffs, `ls`, `grep`, `find`) with workspace path-traversal boundary enforcement.
- **Backend**: FastAPI REST & Server-Sent Events (SSE) streaming engine.
- **Frontend**: Full-featured web IDE with dynamic file tree, real-time tool execution cards, thought accordion, and per-message & cumulative token meters.
- **Test Suite**: Comprehensive automated test coverage in `tests/` (agent functions, API endpoints, token accounting, models).

This guide provides instructors and presenters with an exact, topic-by-topic comparison: **what can be demonstrated directly in the codebase**, **what is partially covered**, and **what must be explained conceptually or assigned as live coding exercises**.

---

## 📊 Quick-Glance Curriculum Matrix

| # | Topic | Status | Codebase Location | Presenter Notes |
|---|---|:---:|---|---|
| **M1.1** | **LLM Fundamentals** | 🟢 **CAN EXPLAIN** | `agents/core.py`, `.env`, `packages/shared/src/shared/models.py` | Full coverage of models, tokens, system/user prompts, API keys. |
| **M1.2** | **What Makes an AI Agent?** | 🟢 **CAN EXPLAIN** | `agents/`, `backend/routes/chat.py` | Clean separation of model, instructions, tools, context, and execution loop. |
| **M1.3** | **The Agent Harness** | 🟢 **CAN EXPLAIN** | `agents/core.py`, `backend/routes/chat.py`, `agents/context.py` | Shows Pydantic AI harness, tool registry, retries, and `UsageLimits`. |
| **M2.4** | **Tool Calling & Function Execution** | 🟢 **CAN EXPLAIN** | `agents/functions/`, `agents/core.py` | Type annotations, JSON schema generation, `RunContext[AgentDeps]`. |
| **M2.5** | **Tool Routing & Tool Design** | 🟢 **CAN EXPLAIN** | `agents/prompts.py`, `agents/functions/` | Clear tool boundaries, typed arguments, error handling, output pagination. |
| **M3.6** | **File Operations & Code Modification** | 🟡 **PARTIAL** | `agents/functions/write.py`, `read.py`, `edit.py`, `context.py` | Diffs, path resolution, and security are live. **Human approval checkpoint is missing**. |
| **M3.7** | **Agent Loops & Orchestration** | 🟢 **CAN EXPLAIN** | `backend/routes/chat.py`, `agents/core.py` | ReAct loop, SSE streaming chunks, stopping limits (`request_limit=15`). |
| **M3.8** | **Context, Memory & Prompts** | 🟢 **CAN EXPLAIN** | `agents/prompts.py`, `backend/routes/chats.py`, `backend/routes/chat.py` | Session persistence (`.chats.json`), history conversion, token usage. |
| **M4.9** | **Feedback Loops & Self-Correction** | 🔴 **CANNOT EXPLAIN DIRECTLY** | Needs tool addition | Agent does not have a subprocess / test execution tool on `main`. |
| **M4.10** | **Building a Usable CLI** | 🔴 **PARADIGM SHIFT** | `frontend/`, `backend/` | Codebase uses a Web IDE instead of a CLI. Great teaching opportunity to compare CLI vs Web UI. |
| **M4.11** | **Failure Modes & Debugging** | 🟢 **CAN EXPLAIN** | `tests/test_agent_tools.py`, `tests/test_token_usage.py` | Path traversal, missing files, ambiguous edits, SSE error events. |
| **M5.12** | **Prompt Injection** | 🟡 **PARTIAL** | `agents/functions/read.py`, `agents/context.py` | Untrusted file content ingestion; automated injection defenses are conceptual. |
| **M5.13** | **Security & Safety** | 🟡 **PARTIAL** | `agents/context.py`, `tests/test_agent_tools.py` | Path traversal & least privilege are covered; container isolation & git rollback are conceptual. |
| **M5.14** | **Observability, Tracing & Cost** | 🟡 **PARTIAL** | `backend/routes/chat.py`, `frontend/src/agent.ts`, `models.py` | Real-time SSE tool traces & token usage are live; JSONL files & USD cost tables are conceptual. |
| **M5.15** | **Evaluation & Reliability** | 🔴 **CANNOT EXPLAIN DIRECTLY** | Needs eval harness | Code has unit/integration tests, but lacks an automated AI benchmark harness. |

---

## 🔍 Detailed Module Breakdown for Presenters

---

### Module 1 — AI Agent Fundamentals
> **Theme:** Understand what we are building before writing the agent.

#### 1. LLM Fundamentals 🟢
- **What Can Be Explained**:
  - LLMs vs. Chatbots vs. Agents: Chatbots return passive text; `code-bud`’s agent inspects workspace state and mutates files.
  - Context windows & Tokens: Highlight the `TokenUsage` model ([`packages/shared/src/shared/models.py`](file:///g:/ai-agent-devs/code-bud/packages/shared/src/shared/models.py)), showing input/prompt tokens, output/completion tokens, and total usage.
  - System Instructions vs. User Prompts: Contrast [`SYSTEM_PROMPT`](file:///g:/ai-agent-devs/code-bud/agents/prompts.py) with dynamic user prompts in [`backend/routes/chat.py`](file:///g:/ai-agent-devs/code-bud/backend/routes/chat.py).
  - API Keys & Multi-Provider Routing: Show how [`.env`](file:///g:/ai-agent-devs/code-bud/.env.example) and [`agents/core.py`](file:///g:/ai-agent-devs/code-bud/agents/core.py) support NVIDIA NIM, Groq, and OpenAI via a unified API client.
- **Presenter Live Demo**:
  1. Open `.env` and switch `AGENT_MODEL`.
  2. Send a prompt in the IDE chatbox and point out the token meter in the chatbox footer.

#### 2. What Makes an AI Agent? 🟢
- **What Can Be Explained**:
  - The 5 Core Pillars: Model, Instructions, Tools, State/Context, and Loop.
  - Tool Requests vs Text Output: Open browser Network tab on `/api/chat/stream` to show raw SSE events (`type: thinking`, `type: activity`, `type: file_action`, `type: chunk`, `type: done`).
  - Levels of Autonomy: Contrast a hardcoded Python script with `code-bud` deciding whether to list files, read code, or execute an edit.

#### 3. The Agent Harness 🟢
- **What Can Be Explained**:
  - Show [`agents/core.py`](file:///g:/ai-agent-devs/code-bud/agents/core.py): The agent factory that binds system instructions, LLM model, retry policy (`retries=1`), and tool definitions.
  - Show [`agents/context.py`](file:///g:/ai-agent-devs/code-bud/agents/context.py): Dependency injection of `AgentDeps` carrying workspace boundaries, event queues, and activity logs.
  - Loop Controller Safeguards: Point out `UsageLimits(request_limit=15)` in [`backend/routes/chat.py`](file:///g:/ai-agent-devs/code-bud/backend/routes/chat.py) which prevents runaway cost and infinite tool-call loops.

---

### Module 2 — Tool Calling and Agent Architecture
> **Theme:** Learn how the model requests tools and how the application validates and executes them.

#### 4. Tool Calling and Function Execution 🟢
- **What Can Be Explained**:
  - Explain how Pydantic AI inspects Python function signatures and docstrings to build OpenAI-compatible JSON Schema tool specifications.
  - Walk through [`agents/functions/write.py`](file:///g:/ai-agent-devs/code-bud/agents/functions/write.py):
    ```python
    def write(ctx: RunContext[AgentDeps], file_path: str, content: str) -> str:
    ```
  - Emphasize how `takes_ctx=True` injects application state into the tool without exposing internal parameters to the LLM.

#### 5. Tool Routing and Tool Design 🟢
- **What Can Be Explained**:
  - Clear Tool Responsibilities: Show how [`agents/prompts.py`](file:///g:/ai-agent-devs/code-bud/agents/prompts.py) instructs the agent when to use `ls` vs `find`, or `read` vs `grep`.
  - Output Limits & Guardrails:
    - [`read.py`](file:///g:/ai-agent-devs/code-bud/agents/functions/read.py): Enforces `max_chars=10_000` with truncation warnings.
    - [`find.py`](file:///g:/ai-agent-devs/code-bud/agents/functions/find.py) & [`grep.py`](file:///g:/ai-agent-devs/code-bud/agents/functions/grep.py): Automatically ignore `.git`, `node_modules`, `__pycache__`, and cap results at 100 matches to protect context limits.
    - [`edit.py`](file:///g:/ai-agent-devs/code-bud/agents/functions/edit.py): Returns distinct, actionable errors if a pattern is missing or matched more than once.

---

### Module 3 — Context, Memory, and Orchestration
> **Theme:** Give the agent controlled access to files, conversation context, and multi-step execution.

#### 6. File Operations and Code Modification 🟡
- **What Can Be Explained 🟢**:
  - Path Resolution & Traversal Defense: Walk through `resolve_path()` in [`agents/context.py`](file:///g:/ai-agent-devs/code-bud/agents/context.py), showing how `os.path.commonpath` safely confines writes to the workspace.
  - Unified Diffs: Show how [`agents/functions/edit.py`](file:///g:/ai-agent-devs/code-bud/agents/functions/edit.py) generates Git-style diffs using Python's standard `difflib.unified_diff`.
- **What Cannot Be Explained Directly 🔴**:
  - **Human Approval**: The current agent autonomously executes file modifications without pausing for user confirmation.
- **Presenter Exercise Idea**:
  - Ask students: *"How would we intercept `edit()` or `write()` in `AgentDeps` to wait for an SSE approval event before saving?"*

#### 7. Agent Loops and Orchestration 🟢
- **What Can Be Explained**:
  - The ReAct loop: Show how `agent.run_stream()` handles `ModelRequest` ➔ `ToolCall` ➔ `ToolReturn` ➔ `ModelResponse`.
  - Event Queueing: Explain how [`AgentDeps.record_activity()`](file:///g:/ai-agent-devs/code-bud/agents/context.py) uses an `asyncio.Queue` to stream tool events directly to the client while the model is thinking.

#### 8. Context, Conversation History, and Prompts 🟢
- **What Can Be Explained**:
  - Multi-Turn History: Show how `backend/routes/chat.py` converts raw chat history into Pydantic AI `ModelMessage` objects.
  - Workspace Context vs Conversation Context: Show how project files in `user_files/` are isolated per session while chat messages are persisted in `.chats.json` ([`backend/routes/chats.py`](file:///g:/ai-agent-devs/code-bud/backend/routes/chats.py)).

---

### Module 4 — Building a Working Coding Agent
> **Theme:** Turn core components into a usable application that can test changes and recover from failures.

#### 9. Feedback Loops and Self-Correction 🔴
- **The Gap**:
  - On the `main` branch, the agent does **not have a test-runner or shell tool** (like `pytest` or `bash`).
  - The agent can write code, but cannot execute code itself to inspect exit codes and self-heal.
- **How to Teach This**:
  - Note to students: "A file-only agent is blind to runtime errors unless given an execution tool."
  - **Quick Presenter Extension**: Implement a simple `run_pytest` tool:
    ```python
    def run_pytest(ctx: RunContext[AgentDeps]) -> str:
        res = subprocess.run(["pytest"], cwd=ctx.deps.workspace_dir, capture_output=True, text=True)
        return f"Exit code {res.returncode}:\n{res.stdout}\n{res.stderr}"
    ```
    This demonstrates the complete edit ➔ test ➔ inspect ➔ fix loop.

#### 10. Building a Usable CLI 🔴 *(Architecture Comparison)*
- **The Gap**:
  - `code-bud` is a **Web-based IDE**, not a CLI application. Commands like `/exit`, `/reset`, `/tools`, `/usage` do not exist as terminal text commands.
- **How to Teach This**:
  - Use this as a teaching comparison: **CLI REPL vs. Modern Web IDE**:
    - CLI `/reset` ➔ Web IDE sidebar "+ New Chat" and session switcher.
    - CLI `/tools` ➔ Web IDE real-time tool activity cards and thought accordions.
    - CLI `/usage` ➔ Web IDE per-message token chips and toolbar session counter.
  - Show how both architectures solve the exact same agent lifecycle challenges.

#### 11. Failure Modes and Debugging 🟢
- **What Can Be Explained**:
  - Run the test suite: `uv run python -m pytest tests/ -v`.
  - Walk through failure cases in [`tests/test_agent_tools.py`](file:///g:/ai-agent-devs/code-bud/tests/test_agent_tools.py):
    - Path traversal attacks (`../outside.txt`).
    - Ambiguous edit targets (`multiple matches found`).
    - Missing files and directory collision errors.

---

### Module 5 — Security and Production Readiness
> **Theme:** Add defenses, observability, and evaluation beyond a single demo.

#### 12. Prompt Injection 🟡
- **What Can Be Explained 🟢**:
  - Indirect Prompt Injection: Explain how files read by the agent via `read()` or `grep()` enter the context window as untrusted data that could contain jailbreaks or instructions.
- **What Cannot Be Explained Directly 🔴**:
  - Automated heuristic scanners or input filtering are not implemented.

#### 13. Security and Safety 🟡
- **What Can Be Explained 🟢**:
  - API Key protection via `.env` and environment variables.
  - Path traversal and symlink escape defense via `resolve_path()`.
  - Principle of Least Privilege: Explain why removing unrestricted shell execution on `main` dramatically hardened the application.
- **What Cannot Be Explained Directly 🔴**:
  - Docker containerization / VM isolation (runs directly on host filesystem).
  - Automated Git checkpointing and revert commands.

#### 14. Observability, Tracing, and Cost 🟡
- **What Can Be Explained 🟢**:
  - Live Tool Event Tracing: Every tool call is logged in `deps.activities` and broadcasted via SSE.
  - Token Accounting: Full breakdown of `input_tokens`, `output_tokens`, and `total_tokens` across sync and streaming requests.
  - Latency Measurement: Live thinking stopwatches in the UI.
- **What Cannot Be Explained Directly 🔴**:
  - Writing persistent JSONL trace files to disk.
  - Automated USD cost calculators ($ per 1K tokens table).

#### 15. Evaluation and Reliability 🔴
- **The Gap**:
  - `code-bud` has standard software tests (`pytest`), but lacks an automated AI agent benchmark suite (e.g. running 25 coding challenges and grading pass rates, token budgets, and loop efficiency).
- **How to Teach This**:
  - Explain why unit testing the harness ([`tests/test_agent_tools.py`](file:///g:/ai-agent-devs/code-bud/tests/test_agent_tools.py)) is Step 1, while benchmark evaluation (SWE-bench / HumanEval) is Step 2.

---

## 🛠️ Summary of Workshop Recommendations

1. **Adopt the "CLI to Web IDE" Narrative**: Present `code-bud` as the evolution of the CLI agent into a production full-stack workspace.
2. **Use `tests/` as the Teaching Anchor**: Walk through the 29 tests in `tests/` to show students how each agent capability and edge-case is verified programmatically.
3. **Optional Live Coding Exercises**:
   - *Exercise 1 (Module 4)*: Add a `run_test` subprocess tool to demonstrate autonomous self-correction.
   - *Exercise 2 (Module 5)*: Write a 15-line hook in `AgentDeps.record_activity()` to dump JSONL traces to disk.
