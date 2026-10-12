import pytest
from shared.models import (
    ChatMessage,
    ChatRequest,
    ChatResponse,
    TokenUsage,
    ToolCallEvent,
    FileItem,
    FileContent,
    FileSaveRequest,
    CommandRequest,
    CommandResponse,
)

def test_chat_message_model():
    msg = ChatMessage(role="user", content="Hello")
    assert msg.role == "user"
    assert msg.content == "Hello"
    assert msg.tool_calls is None

    asst = ChatMessage(role="assistant", content="Hi", tool_calls=[{"name": "write", "args": {}}])
    assert asst.role == "assistant"
    assert len(asst.tool_calls) == 1

def test_chat_request_defaults():
    req = ChatRequest(message="Write code")
    assert req.message == "Write code"
    assert req.model is None
    assert req.session_id == "default"
    assert req.history == []
    assert req.workspace is None

def test_chat_response_with_tokens():
    u = TokenUsage(input_tokens=100, output_tokens=50, total_tokens=150)
    res = ChatResponse(
        response="OK",
        tool_calls=[ToolCallEvent(tool_name="write", args={"file_path": "a.py", "content": "x"})],
        session_id="s1",
        usage=u,
    )
    assert res.response == "OK"
    assert len(res.tool_calls) == 1
    assert res.usage.total_tokens == 150

def test_file_models():
    f = FileItem(name="app.py", path="src/app.py", is_dir=False, size=1024)
    assert f.name == "app.py"
    assert not f.is_dir
    assert f.size == 1024

    d = FileItem(name="src", path="src", is_dir=True, children=[f])
    assert d.is_dir
    assert len(d.children) == 1

    fc = FileContent(path="src/app.py", content="print(1)")
    assert fc.content == "print(1)"
    assert not fc.is_readonly

    fs = FileSaveRequest(path="src/app.py", content="print(2)")
    assert fs.content == "print(2)"

def test_command_models():
    cmd = CommandRequest(command="python run.py", timeout=15)
    assert cmd.command == "python run.py"
    assert cmd.timeout == 15

    resp = CommandResponse(stdout="done", stderr="", exit_code=0)
    assert resp.exit_code == 0
    assert resp.stdout == "done"
