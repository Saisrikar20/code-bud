import os
from pydantic_ai import RunContext
from ..context import AgentDeps, resolve_path

def write(ctx: RunContext[AgentDeps], file_path: str, content: str) -> str:
    """Write or overwrite a file in the workspace. Automatically creates parent directories."""
    resolved = resolve_path(ctx, file_path)
    if not resolved:
        return f'Error: Cannot write to "{file_path}" outside the workspace'
    target, ws = resolved
    if os.path.isdir(target):
        return f'Error: Cannot write to "{file_path}" because it is a directory'

    try:
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "w", encoding="utf-8") as f:
            f.write(content)

        lines, rel = len(content.splitlines()), os.path.relpath(target, ws).replace("\\", "/")
        if hasattr(ctx.deps, "modified_files") and rel not in ctx.deps.modified_files:
            ctx.deps.modified_files.append(rel)
        if hasattr(ctx.deps, "record_activity"):
            ctx.deps.record_activity({"type": "file_action", "action": "write", "file": rel, "lines": lines, "detail": f"Wrote {rel} ({lines} lines)"})

        return f'Successfully wrote {len(content)} characters ({lines} lines) to "{file_path}".'
    except Exception as e:
        return f'Error writing to "{file_path}": {e}'
