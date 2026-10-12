import json
import pytest
from unittest.mock import MagicMock
from fastapi.testclient import TestClient
from shared.models import TokenUsage, ChatResponse, ChatRequest
from backend.routes.chat import extract_usage
from pydantic_ai.usage import RunUsage

def test_token_usage_model_defaults():
    u = TokenUsage()
    assert u.input_tokens == 0
    assert u.output_tokens == 0
    assert u.total_tokens == 0
    assert u.requests == 1

def test_token_usage_custom_values():
    u = TokenUsage(input_tokens=150, output_tokens=75, total_tokens=225, requests=2)
    assert u.input_tokens == 150
    assert u.output_tokens == 75
    assert u.total_tokens == 225
    assert u.requests == 2

def test_extract_usage_with_pydantic_ai_run_usage():
    pydantic_usage = RunUsage(input_tokens=350, output_tokens=120)
    mock_res = MagicMock()
    mock_res.usage = pydantic_usage

    extracted = extract_usage(mock_res)
    assert isinstance(extracted, TokenUsage)
    assert extracted.input_tokens == 350
    assert extracted.output_tokens == 120
    assert extracted.total_tokens == 470
    assert extracted.requests == 1

def test_extract_usage_with_callable_usage():
    mock_res = MagicMock()
    mock_res.usage = MagicMock(return_value=RunUsage(input_tokens=80, output_tokens=20))

    extracted = extract_usage(mock_res)
    assert extracted.input_tokens == 80
    assert extracted.output_tokens == 20
    assert extracted.total_tokens == 100

def test_extract_usage_fallback_on_none():
    mock_res = MagicMock()
    mock_res.usage = None

    extracted = extract_usage(mock_res)
    assert extracted.input_tokens == 0
    assert extracted.output_tokens == 0
    assert extracted.total_tokens == 0

def test_chat_response_includes_token_usage():
    u = TokenUsage(input_tokens=200, output_tokens=80, total_tokens=280)
    resp = ChatResponse(
        response="Here is your code",
        tool_calls=[],
        session_id="test_session",
        usage=u,
    )
    d = resp.model_dump()
    assert "usage" in d
    assert d["usage"]["total_tokens"] == 280
    assert d["usage"]["input_tokens"] == 200
    assert d["usage"]["output_tokens"] == 80

def test_chat_stream_sse_emits_usage_event(test_client: TestClient, monkeypatch):
    """Test that /api/chat/stream yields SSE events with type 'usage' and in 'done'."""
    from pydantic_ai import Agent
    from pydantic_ai.models.test import TestModel

    # Mock create_agent to return an agent using TestModel with predefined usage
    test_model = TestModel()
    mock_agent = Agent(test_model)
    monkeypatch.setattr("backend.routes.chat.create_agent", lambda model: mock_agent)

    req_data = {
        "message": "hello agent",
        "workspace": "project_1",
        "session_id": "test_stream",
    }

    with test_client.stream("POST", "/api/chat/stream", json=req_data) as response:
        assert response.status_code == 200
        events = []
        for line in response.iter_lines():
            if line.startswith("data: "):
                data_str = line[6:]
                try:
                    events.append(json.loads(data_str))
                except Exception:
                    pass

    # Verify event types received
    event_types = [e.get("type") for e in events]
    assert "thinking" in event_types
    assert "usage" in event_types
    assert "done" in event_types

    # Find the usage event
    usage_event = next(e for e in events if e.get("type") == "usage")
    assert "usage" in usage_event
    u_data = usage_event["usage"]
    assert "input_tokens" in u_data
    assert "output_tokens" in u_data
    assert "total_tokens" in u_data

    # Verify done event also carries usage
    done_event = next(e for e in events if e.get("type") == "done")
    assert "usage" in done_event
    assert done_event["usage"]["total_tokens"] >= 0

def test_chat_sync_endpoint_returns_usage(test_client: TestClient, monkeypatch):
    """Test that non-streaming POST /api/chat returns usage in ChatResponse."""
    from pydantic_ai import Agent
    from pydantic_ai.models.test import TestModel

    test_model = TestModel()
    mock_agent = Agent(test_model)
    monkeypatch.setattr("backend.routes.chat.create_agent", lambda model: mock_agent)

    req_data = {
        "message": "Write a quick function",
        "session_id": "test_sync",
    }

    res = test_client.post("/api/chat", json=req_data)
    assert res.status_code == 200
    data = res.json()
    assert "response" in data
    assert "usage" in data
    assert data["usage"] is not None
    assert "total_tokens" in data["usage"]
    assert "input_tokens" in data["usage"]
    assert "output_tokens" in data["usage"]
