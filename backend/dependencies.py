import os
from functools import lru_cache
from pathlib import Path
from agents.core import create_agent
from agents.context import AgentDeps
from shared.config import load_config, AppConfig

@lru_cache()
def get_app_config() -> AppConfig:
    return load_config()

def get_workspace_dir(folder: str | None = None) -> str:
    # Check if USER_FILES_DIR or WORKSPACE_DIR environment variable is set
    env_ws = os.getenv("USER_FILES_DIR") or os.getenv("WORKSPACE_DIR") or os.getenv("WORKSPACE_ROOT")
    if env_ws:
        base = Path(env_ws).resolve()
    else:
        base = Path(__file__).resolve().parent.parent / "user_files"

    base.mkdir(parents=True, exist_ok=True)

    if folder:
        clean = os.path.basename(folder.strip("/\\"))
        if clean and clean not in {".", ".."}:
            target = base / clean
            target.mkdir(parents=True, exist_ok=True)
            return str(target)

    return str(base)

def get_agent_deps(session_id: str = "default", folder: str | None = None) -> AgentDeps:
    return AgentDeps(
        workspace_dir=get_workspace_dir(folder),
        session_id=session_id,
    )
