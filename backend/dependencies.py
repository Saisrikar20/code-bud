import os
from functools import lru_cache
from pathlib import Path
from agents.core import create_agent
from agents.context import AgentDeps
from shared.config import load_config, AppConfig

@lru_cache()
def get_app_config() -> AppConfig:
    return load_config()

def get_workspace_dir() -> str:
    # Check if USER_FILES_DIR or WORKSPACE_DIR environment variable is set
    env_ws = os.getenv("USER_FILES_DIR") or os.getenv("WORKSPACE_DIR") or os.getenv("WORKSPACE_ROOT")
    if env_ws:
        return os.path.abspath(env_ws)
    
    # Default to code-bud/user_files for user and AI generated files
    base_dir = Path(__file__).resolve().parent.parent
    user_files = base_dir / "user_files"
    user_files.mkdir(parents=True, exist_ok=True)
    return str(user_files)

def get_agent_deps(session_id: str = "default") -> AgentDeps:
    return AgentDeps(
        workspace_dir=get_workspace_dir(),
        session_id=session_id,
    )
