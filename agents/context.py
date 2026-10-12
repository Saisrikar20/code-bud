import os
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
    activities: list[dict] = field(default_factory=list)
    event_queue: Optional[Any] = None

    def record_activity(self, activity: dict) -> None:
        self.activities.append(activity)
        if self.event_queue is not None:
            try:
                self.event_queue.put_nowait(activity)
            except Exception:
                pass

    @property
    def deps(self) -> str:
        return self.workspace_dir

def resolve_path(ctx: Any, rel_path: str = ".") -> tuple[str, str] | None:
    """Resolve target path safely within workspace. Returns (abs_target, abs_workspace) or None."""
    ws = getattr(ctx, "deps", ctx)
    ws_dir = os.path.abspath(ws.workspace_dir if isinstance(ws, AgentDeps) else str(ws))
    target = os.path.normpath(os.path.join(ws_dir, rel_path))
    try:
        if os.path.commonpath([target, ws_dir]) == ws_dir:
            return target, ws_dir
    except Exception:
        pass
    return None
