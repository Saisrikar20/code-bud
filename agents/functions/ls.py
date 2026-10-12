import os
from pydantic_ai import RunContext
from ..context import AgentDeps

def _get_workspace(ctx: RunContext[AgentDeps] | RunContext[str] | str) -> str:
    if isinstance(ctx, str):
        return ctx
    deps = getattr(ctx, "deps", ctx)
    if isinstance(deps, AgentDeps):
        return deps.workspace_dir
    return str(deps)

def ls(ctx: RunContext[AgentDeps], dir: str = ".") -> str:
    """
    List files and directories in a workspace directory.

    Args:
        dir: Directory to inspect, relative to workspace root (defaults to current dir '.').

    Returns:
        Names, sizes, and directory status of items in the directory.
    """
    workspace = _get_workspace(ctx)
    abs_path = os.path.abspath(workspace)
    full_path = os.path.join(abs_path, dir)
    target_dir = os.path.normpath(full_path)

    try:
        valid = os.path.commonpath([target_dir, abs_path]) == abs_path
    except (ValueError, Exception):
        valid = False

    if not valid:
        return f'Error: Cannot list "{dir}" as it is outside the permitted workspace directory'
    if not os.path.isdir(target_dir):
        return f'Error: Directory "{dir}" does not exist or is not a directory'

    file_info = [f"Result for '{dir if dir != '.' else '.'}' directory:"]
    try:
        if hasattr(ctx.deps, "record_activity"):
            ctx.deps.record_activity({
                "type": "activity",
                "action": "analyzing",
                "detail": f"Analyzing directory '{dir if dir != '.' else '.'}'"
            })
        contents = sorted(os.listdir(target_dir))
        for item in contents:
            item_path = os.path.join(target_dir, item)
            is_d = os.path.isdir(item_path)
            size = os.path.getsize(item_path) if not is_d else 0
            file_info.append(f"- {item} (dir: {is_d}, size: {size} bytes)")
    except Exception as e:
        return f"Error listing directory: {e}"

    return "\n".join(file_info)
