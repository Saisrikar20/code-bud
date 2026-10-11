import os
import fnmatch
from pydantic_ai import RunContext
from ..context import AgentDeps
from .ls import _get_workspace

def find(ctx: RunContext[AgentDeps], pattern: str, dir: str = ".") -> str:
    """
    Find files matching a glob pattern (e.g. '*.py', 'test_*', 'config.*').

    Args:
        pattern: The filename pattern to match.
        dir: Starting directory relative to workspace root (defaults to '.').

    Returns:
        List of matching file paths.
    """
    workspace = _get_workspace(ctx)
    abs_path = os.path.abspath(workspace)
    start_dir = os.path.normpath(os.path.join(abs_path, dir))

    try:
        valid = os.path.commonpath([start_dir, abs_path]) == abs_path
    except (ValueError, Exception):
        valid = False

    if not valid:
        return f'Error: Directory "{dir}" is outside workspace'

    matches = []
    for root, dirs, files in os.walk(start_dir):
        dirs[:] = [d for d in dirs if d not in {".git", "node_modules", ".venv", "__pycache__"}]
        for filename in files:
            if fnmatch.fnmatch(filename, pattern):
                rel_path = os.path.relpath(os.path.join(root, filename), abs_path)
                matches.append(rel_path)
                if len(matches) >= 100:
                    return "\n".join(matches) + "\n\n[Truncated: 100+ files found]"

    if not matches:
        return f"No files matching '{pattern}' in '{dir}'."
    return "\n".join(matches)
