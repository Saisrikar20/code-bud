import os
import fnmatch
from pydantic_ai import RunContext
from ..context import AgentDeps, resolve_path

def find(ctx: RunContext[AgentDeps], pattern: str, dir: str = ".") -> str:
    """Find files matching a glob pattern (e.g. '*.py', 'test_*')."""
    resolved = resolve_path(ctx, dir)
    if not resolved:
        return f'Error: Directory "{dir}" is outside workspace'
    target, ws = resolved

    matches = []
    for root, dirs, files in os.walk(target):
        dirs[:] = [d for d in dirs if d not in {".git", "node_modules", ".venv", "__pycache__"}]
        for f in files:
            if fnmatch.fnmatch(f, pattern):
                matches.append(os.path.relpath(os.path.join(root, f), ws).replace("\\", "/"))
                if len(matches) >= 100:
                    return "\n".join(matches) + "\n\n[Truncated: 100+ files found]"

    return "\n".join(matches) if matches else f"No files matching '{pattern}' in '{dir}'."
