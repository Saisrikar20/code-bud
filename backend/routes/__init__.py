from .health import router as health_router
from .files import router as files_router
from .terminal import router as terminal_router
from .chat import router as chat_router

__all__ = ["health_router", "files_router", "terminal_router", "chat_router"]
