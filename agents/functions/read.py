import os
from pydantic_ai import RunContext
from ..context import AgentDeps, resolve_path

def read(ctx: RunContext[AgentDeps], file_path: str, max_chars: int = 10_000) -> str:
    """Read the contents of a file in the workspace."""
    resolved = resolve_path(ctx, file_path)
    if not resolved:
        return f'Error: Cannot read "{file_path}" outside the workspace'
    target, _ = resolved
    if not os.path.exists(target):
        return f'Error: File "{file_path}" does not exist'
    if os.path.isdir(target):
        return f'Error: "{file_path}" is a directory. Use ls instead.'

    try:
        if hasattr(ctx.deps, "record_activity"):
            ctx.deps.record_activity({"type": "activity", "action": "reading", "file": file_path, "detail": f"Inspecting {file_path}"})
        with open(target, "r", encoding="utf-8", errors="replace") as f:
            content = f.read(max_chars + 1)
        return content[:max_chars] + (f"\n\n[Warning: Content truncated at {max_chars} chars]" if len(content) > max_chars else "")
    except Exception as e:
        return f'Error reading "{file_path}": {e}'
