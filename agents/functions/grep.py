import os
import re
import fnmatch
import shutil
import asyncio
from pydantic_ai import RunContext
from ..context import AgentDeps, resolve_path

async def grep(ctx: RunContext[AgentDeps], pattern: str, glob: str | None = None, ignore_case: bool = True) -> str:
    """Search for a text pattern in files across the workspace."""
    resolved = resolve_path(ctx, ".")
    if not resolved:
        return "Error: Workspace path invalid"
    _, ws = resolved

    # 1. Try ripgrep if installed
    if shutil.which("rg"):
        cmd = ["rg", "--line-number", *(["--ignore-case"] if ignore_case else []), *(["--glob", glob] if glob else []), pattern, "."]
        try:
            proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, cwd=ws)
            out, _ = await proc.communicate()
            lines = out.decode("utf-8", errors="replace").splitlines()
            return "\n".join(lines[:100]) + (f"\n\n[Truncated {len(lines)-100} matches]" if len(lines) > 100 else "") if lines else f"No matches found for '{pattern}'"
        except Exception:
            pass

    # 2. Pure Python fallback
    try:
        compiled = re.compile(pattern, re.IGNORECASE if ignore_case else 0)
    except Exception as e:
        return f"Invalid regex pattern: {e}"

    matches = []
    for root, dirs, files in os.walk(ws):
        dirs[:] = [d for d in dirs if d not in {".git", "node_modules", ".venv", "__pycache__", "dist"}]
        for f in files:
            if glob and not fnmatch.fnmatch(f, glob):
                continue
            fpath, rel = os.path.join(root, f), os.path.relpath(os.path.join(root, f), ws).replace("\\", "/")
            try:
                with open(fpath, "r", encoding="utf-8", errors="ignore") as file_obj:
                    for i, line in enumerate(file_obj, 1):
                        if compiled.search(line):
                            matches.append(f"{rel}:{i}:{line.rstrip()}")
                            if len(matches) >= 100:
                                return "\n".join(matches) + "\n\n[Truncated: 100+ matches]"
            except Exception:
                pass

    return "\n".join(matches) if matches else f"No matches found for '{pattern}'"
