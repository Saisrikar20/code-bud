from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Dict, Any

class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system", "tool"] = "user"
    content: str
    tool_calls: Optional[List[Dict[str, Any]]] = None

class ChatRequest(BaseModel):
    message: str
    model: Optional[str] = None
    session_id: Optional[str] = "default"
    history: List[ChatMessage] = Field(default_factory=list)
    workspace: Optional[str] = None

class ToolCallEvent(BaseModel):
    tool_name: str
    args: Dict[str, Any]
    output: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    tool_calls: List[ToolCallEvent] = Field(default_factory=list)
    session_id: str

class FileItem(BaseModel):
    name: str
    path: str
    is_dir: bool
    size: Optional[int] = None
    children: Optional[List["FileItem"]] = None

class FileContent(BaseModel):
    path: str
    content: str
    is_readonly: bool = False

class FileSaveRequest(BaseModel):
    path: str
    content: str

class CommandRequest(BaseModel):
    command: str
    cwd: Optional[str] = None
    timeout: int = 30

class CommandResponse(BaseModel):
    stdout: str
    stderr: str
    exit_code: int
