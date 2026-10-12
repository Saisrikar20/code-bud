import os
import difflib
from pydantic_ai import RunContext
from ..context import AgentDeps
from .ls import _get_workspace

def edit(ctx: RunContext[AgentDeps], file_path: str, old_string: str, new_string: str) -> str:
    """
    Replace an exact text block in a file with new text.
    For safety, old_string must appear exactly once in the file.

    Args:
        file_path: Relative path to the file.
        old_string: Exact existing text to replace.
        new_string: New text to put in its place.

    Returns:
        Unified diff of changes applied, or error description.
    """
    if old_string == new_string:
        return "Error: old_string and new_string cannot be identical"

    workspace = _get_workspace(ctx)
    abs_path = os.path.abspath(workspace)
    full_path = os.path.join(abs_path, file_path)
    target_path = os.path.normpath(full_path)

    try:
        valid = os.path.commonpath([target_path, abs_path]) == abs_path
    except (ValueError, Exception):
        valid = False

    if not valid:
        return f'Error: Cannot edit "{file_path}" as it is outside the workspace'
    if not os.path.isfile(target_path):
        return f'Error: File "{file_path}" does not exist'

    try:
        with open(target_path, "r", encoding="utf-8") as f:
            content = f.read()

        count = content.count(old_string)
        if count == 0:
            return f"Error: The target old_string was not found in '{file_path}'."
        if count > 1:
            return f"Error: Multiple matches ({count}) found for old_string in '{file_path}'. Please provide more surrounding context."

        start = content.find(old_string)
        end = start + len(old_string)
        new_content = content[:start] + new_string + content[end:]

        with open(target_path, "w", encoding="utf-8") as f:
            f.write(new_content)

        clean_rel = os.path.relpath(target_path, abs_path).replace("\\", "/")
        new_lines_count = len(new_string.splitlines())
        old_lines_count = len(old_string.splitlines())

        if hasattr(ctx.deps, "modified_files"):
            if clean_rel not in ctx.deps.modified_files:
                ctx.deps.modified_files.append(clean_rel)

        if hasattr(ctx.deps, "record_activity"):
            ctx.deps.record_activity({
                "type": "file_action",
                "action": "edit",
                "file": clean_rel,
                "lines": new_lines_count,
                "old_lines": old_lines_count,
                "detail": f"Edited {clean_rel} (replaced {old_lines_count} lines with {new_lines_count} lines)"
            })

        diff = "\n".join(
            difflib.unified_diff(
                content.splitlines(),
                new_content.splitlines(),
                fromfile=f"a/{file_path}",
                tofile=f"b/{file_path}",
                lineterm="",
            )
        )
        return f"Successfully edited '{file_path}':\n{diff}"
    except Exception as e:
        return f"Error editing '{file_path}': {e}"
