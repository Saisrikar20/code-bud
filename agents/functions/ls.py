import os
from pydantic_ai import RunContext
from ..context import AgentDeps, resolve_path

def _get_workspace(ctx) -> str:
    """Helper for extracting workspace directory."""
    res = resolve_path(ctx, ".")
    return res[1] if res else "."

def ls(ctx: RunContext[AgentDeps], dir: str = ".") -> str:
    """List files and directories in a workspace directory."""
    resolved = resolve_path(ctx, dir)
    if not resolved:
        return f'Error: Cannot list "{dir}" outside the workspace'
    target, _ = resolved
    if not os.path.isdir(target):
        return f'Error: Directory "{dir}" does not exist'

    try:
        if hasattr(ctx.deps, "record_activity"):
            ctx.deps.record_activity({"type": "activity", "action": "analyzing", "detail": f"Analyzing directory '{dir}'"})
        items = sorted(os.listdir(target))
        info = [f"Result for '{dir}' directory:"]
        for item in items:
            p = os.path.join(target, item)
            is_d = os.path.isdir(p)
            info.append(f"- {item} (dir: {is_d}, size: {os.path.getsize(p) if not is_d else 0} bytes)")
        return "\n".join(info)
    except Exception as e:
        return f"Error listing directory: {e}"
