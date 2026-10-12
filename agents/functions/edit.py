import os
import difflib
from pydantic_ai import RunContext
from ..context import AgentDeps, resolve_path

def edit(ctx: RunContext[AgentDeps], file_path: str, old_string: str, new_string: str) -> str:
    """Replace an exact text block in a file with new text. old_string must appear exactly once."""
    if old_string == new_string:
        return "Error: old_string and new_string cannot be identical"

    resolved = resolve_path(ctx, file_path)
    if not resolved:
        return f'Error: Cannot edit "{file_path}" outside the workspace'
    target, ws = resolved
    if not os.path.isfile(target):
        return f'Error: File "{file_path}" does not exist'

    try:
        with open(target, "r", encoding="utf-8") as f:
            content = f.read()

        count = content.count(old_string)
        if count == 0:
            return f"Error: The target old_string was not found in '{file_path}'."
        if count > 1:
            return f"Error: Multiple matches ({count}) found for old_string in '{file_path}'. Please provide more surrounding context."

        new_content = content.replace(old_string, new_string, 1)
        with open(target, "w", encoding="utf-8") as f:
            f.write(new_content)

        rel = os.path.relpath(target, ws).replace("\\", "/")
        new_lines, old_lines = len(new_string.splitlines()), len(old_string.splitlines())
        if hasattr(ctx.deps, "modified_files") and rel not in ctx.deps.modified_files:
            ctx.deps.modified_files.append(rel)
        if hasattr(ctx.deps, "record_activity"):
            ctx.deps.record_activity({
                "type": "file_action", "action": "edit", "file": rel,
                "lines": new_lines, "old_lines": old_lines,
                "detail": f"Edited {rel} (replaced {old_lines} lines with {new_lines} lines)"
            })

        diff = "\n".join(difflib.unified_diff(content.splitlines(), new_content.splitlines(), fromfile=f"a/{file_path}", tofile=f"b/{file_path}", lineterm=""))
        return f"Successfully edited '{file_path}':\n{diff}"
    except Exception as e:
        return f"Error editing '{file_path}': {e}"
