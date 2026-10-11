from dataclasses import dataclass, field
from typing import Optional, Callable, Any

@dataclass
class AgentDeps:
    """Dependencies injected into every tool call via RunContext[AgentDeps]."""
    workspace_dir: str
    session_id: str = "default"
    max_chars: int = 10_000
    on_tool_call: Optional[Callable[[str, dict, Any], None]] = None
    modified_files: list[str] = field(default_factory=list)

    @property
    def deps(self) -> str:
        """Backward compatibility with str cwd dependencies."""
        return self.workspace_dir
