import os
import shutil
import asyncio
from pydantic_ai import RunContext
from ..context import AgentDeps
from .ls import _get_workspace

async def grep(
    ctx: RunContext[AgentDeps],
    pattern: str,
    glob: str | None = None,
    ignore_case: bool = True,
) -> str:
    """
    Search for a text pattern in files across the workspace using ripgrep or python fallback.

    Args:
        pattern: The regular expression or text to search for.
        glob: Optional file glob pattern to limit the search (e.g. '*.py', '*.ts').
        ignore_case: Whether to perform case-insensitive search (default True).

    Returns:
        Matches formatted with file paths and line numbers.
    """
    workspace = _get_workspace(ctx)
    rg_path = shutil.which("rg")

    if rg_path:
        cmd = ["rg", "--line-number"]
        if ignore_case:
            cmd.append("--ignore-case")
        if glob:
            cmd.extend(["--glob", glob])
        cmd.extend([pattern, "."])

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=workspace,
            )
            stdout, stderr = await process.communicate()
            output = stdout.decode("utf-8", errors="replace")
            if not output:
                return f"No matches found for '{pattern}'"
            lines = output.splitlines()
            if len(lines) > 100:
                return "\n".join(lines[:100]) + f"\n\n[Truncated {len(lines) - 100} additional matches]"
            return output
        except Exception as e:
            return f"Error executing ripgrep: {e}"

    # Pure Python fallback if rg is not available on system
    matches = []
    import fnmatch
    import re

    regex_flags = re.IGNORECASE if ignore_case else 0
    try:
        compiled = re.compile(pattern, regex_flags)
    except Exception as e:
        return f"Invalid regex pattern: {e}"

    for root, dirs, files in os.walk(workspace):
        # Exclude common large folders
        dirs[:] = [d for d in dirs if d not in {".git", "node_modules", ".venv", "__pycache__", "dist", "build"}]
        for file in files:
            if glob and not fnmatch.fnmatch(file, glob):
                continue
            rel_root = os.path.relpath(root, workspace)
            rel_file = os.path.normpath(os.path.join(rel_root, file))
            file_full = os.path.join(root, file)
            try:
                with open(file_full, "r", encoding="utf-8", errors="ignore") as f:
                    for i, line in enumerate(f, 1):
                        if compiled.search(line):
                            matches.append(f"{rel_file}:{i}:{line.rstrip()}")
                            if len(matches) >= 100:
                                return "\n".join(matches) + "\n\n[Truncated: 100+ matches found]"
            except Exception:
                continue

    if not matches:
        return f"No matches found for '{pattern}'"
    return "\n".join(matches)
