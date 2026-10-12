import os
from pydantic_ai import RunContext
from ..context import AgentDeps
from .ls import _get_workspace

def read(ctx: RunContext[AgentDeps], file_path: str, max_chars: int = 10_000) -> str:
    """
    Read the contents of a file in the workspace.

    Args:
        file_path: Relative path to the file.
        max_chars: Maximum characters to read before truncating (default 10,000).

    Returns:
        The content of the file or an error message.
    """
    workspace = _get_workspace(ctx)
    abs_path = os.path.abspath(workspace)
    full_path = os.path.join(abs_path, file_path)
    target_path = os.path.normpath(full_path)

    try:
        valid = os.path.commonpath([target_path, abs_path]) == abs_path
    except (ValueError, Exception):
        valid = False

    if not valid:
        return f'Error: Cannot read "{file_path}" as it is outside the permitted workspace'
    if not os.path.exists(target_path):
        return f'Error: File "{file_path}" does not exist'
    if os.path.isdir(target_path):
        return f'Error: "{file_path}" is a directory, not a file. Use ls instead.'

    try:
        if hasattr(ctx.deps, "record_activity"):
            ctx.deps.record_activity({
                "type": "activity",
                "action": "reading",
                "file": file_path,
                "detail": f"Inspecting {file_path}"
            })

        with open(target_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read(max_chars + 1)
        if len(content) > max_chars:
            return (
                content[:max_chars]
                + f"\n\n[Warning: Content truncated at {max_chars} characters. Specify higher max_chars if needed.]"
            )
        return content
    except Exception as e:
        return f'Error reading "{file_path}": {e}'
