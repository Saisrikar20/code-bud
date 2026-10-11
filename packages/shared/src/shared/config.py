import os
from pathlib import Path
from pydantic import BaseModel, Field

CONFIG_DIR = Path.home() / ".code-bud"
CONFIG_FILE = CONFIG_DIR / "config.json"

class AgentSettings(BaseModel):
    model: str = "nvidia:z-ai/glm-5.3-flash"
    max_steps: int = 20
    system_prompt_extra: str = ""
    recent_models: list[str] = Field(
        default_factory=lambda: [
            "nvidia:z-ai/glm-5.3-flash",
            "nvidia:openai/gpt-oss-20b",
            "nvidia:meta/llama-3.2-11b-vision-instruct",
            "gemini:gemini-2.5-flash",
            "openai:gpt-4o",
            "anthropic:claude-3-5-sonnet-latest"
        ]
    )

class ServerSettings(BaseModel):
    host: str = "127.0.0.1"
    port: int = 8000
    workspace_root: str = Field(default_factory=lambda: str(Path.cwd()))

class AppConfig(BaseModel):
    agent: AgentSettings = Field(default_factory=AgentSettings)
    server: ServerSettings = Field(default_factory=ServerSettings)

def load_config() -> AppConfig:
    if not CONFIG_FILE.exists():
        cfg = AppConfig()
        save_config(cfg)
        return cfg
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            return AppConfig.model_validate_json(f.read())
    except Exception:
        return AppConfig()

def save_config(config: AppConfig) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        f.write(config.model_dump_json(indent=2))
