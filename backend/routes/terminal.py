import asyncio
import os
from fastapi import APIRouter, Depends
from shared.models import CommandRequest, CommandResponse
from ..dependencies import get_workspace_dir

router = APIRouter(prefix="/terminal", tags=["terminal"])

@router.post("/run", response_model=CommandResponse)
async def run_command(req: CommandRequest, default_cwd: str = Depends(get_workspace_dir)):
    cwd = req.cwd or default_cwd
    if not os.path.exists(cwd):
        cwd = default_cwd

    try:
        proc = await asyncio.create_subprocess_shell(
            req.command,
            cwd=cwd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=req.timeout)
            return CommandResponse(
                stdout=stdout.decode("utf-8", errors="replace"),
                stderr=stderr.decode("utf-8", errors="replace"),
                exit_code=proc.returncode if proc.returncode is not None else 0,
            )
        except asyncio.TimeoutError:
            proc.kill()
            return CommandResponse(
                stdout="",
                stderr=f"Command timed out after {req.timeout} seconds",
                exit_code=-1,
            )
    except Exception as e:
        return CommandResponse(
            stdout="",
            stderr=str(e),
            exit_code=-1,
        )
