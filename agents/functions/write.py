import os
from pydantic_ai import RunContext
from ..context import AgentDeps
from .ls import _get_workspace

def write(ctx: RunContext[AgentDeps], file_path: str, content: str) -> str:
    """
    Write or overwrite a file in the workspace. Automatically creates parent directories.

    Args:
        file_path: Relative path of the file to write (e.g. 'hello.py', 'app.py').
        content: The FULL complete source code or text to write from start to finish. Never write partial or incomplete snippets.

    Returns:
        Confirmation message or error.
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
        return f'Error: Cannot write to "{file_path}" as it is outside the workspace'
    if os.path.isdir(target_path):
        return f'Error: Cannot write to "{file_path}" because it is an existing directory'

    try:
        parent_dir = os.path.dirname(target_path)
        if parent_dir:
            os.makedirs(parent_dir, exist_ok=True)

        with open(target_path, "w", encoding="utf-8") as f:
            f.write(content)

        lines_count = len(content.splitlines())
        clean_rel = os.path.relpath(target_path, abs_path).replace("\\", "/")

        if hasattr(ctx.deps, "modified_files"):
            if clean_rel not in ctx.deps.modified_files:
                ctx.deps.modified_files.append(clean_rel)

        if hasattr(ctx.deps, "record_activity"):
            ctx.deps.record_activity({
                "type": "file_action",
                "action": "write",
                "file": clean_rel,
                "lines": lines_count,
                "detail": f"Wrote {clean_rel} ({lines_count} lines)"
            })

        return f'Successfully wrote {len(content)} characters ({lines_count} lines) to "{file_path}".'
    except Exception as e:
        return f'Error writing to "{file_path}": {e}'
