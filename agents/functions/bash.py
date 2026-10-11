import asyncio
from pydantic_ai import RunContext
from ..context import AgentDeps
from .ls import _get_workspace

async def bash(ctx: RunContext[AgentDeps], command: str, timeout: int = 30) -> str:
    """
    Execute a shell command inside the workspace and return standard output and exit code.

    Args:
        command: The shell command to run.
        timeout: Maximum execution time in seconds (default 30).

    Returns:
        The command's exit code, stdout, and stderr.
    """
    workspace = _get_workspace(ctx)
    print(f"-- calling bash(cwd={workspace}, cmd={command}, timeout={timeout})")

    try:
        process = await asyncio.create_subprocess_shell(
            command,
            cwd=workspace,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

        output_lines = []

        async def read_stdout():
            while True:
                line = await process.stdout.readline()
                if not line:
                    break
                decoded = line.decode("utf-8", errors="replace")
                output_lines.append(decoded)

        reader_task = asyncio.create_task(read_stdout())

        try:
            await asyncio.wait_for(process.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
            await reader_task
            return f"Error: Command timed out after {timeout} seconds."
        except asyncio.CancelledError:
            process.kill()
            await process.wait()
            raise

        await reader_task
        if len(output_lines) > 100:
            output_lines = output_lines[-100:]

        return f"Exit Code: {process.returncode}\nSTDOUT:\n{''.join(output_lines)}"
    except Exception as e:
        return f"Error running command: {e}"
