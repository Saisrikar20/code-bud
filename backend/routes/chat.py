import json
import asyncio
from typing import AsyncGenerator
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic_ai.messages import ModelMessage, ModelRequest, ModelResponse, UserPromptPart, TextPart
from pydantic_ai.usage import UsageLimits
from shared.models import ChatRequest, ChatResponse, ToolCallEvent
from shared.config import load_config
from agents.core import create_agent
from agents.context import AgentDeps
from ..dependencies import get_agent_deps

router = APIRouter(prefix="/chat", tags=["chat"])

@router.get("/models")
async def list_models():
    config = load_config()
    return {
        "current": config.agent.model,
        "models": config.agent.recent_models,
    }

@router.post("", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest):
    deps = get_agent_deps(session_id=req.session_id or "default", folder=req.workspace)
    try:
        agent = create_agent(req.model)
    except Exception:
        agent = create_agent(None)

    try:
        raw_history = req.history
        if raw_history and raw_history[-1].role == "user" and raw_history[-1].content == req.message:
            raw_history = raw_history[:-1]

        history: list[ModelMessage] = []
        for msg in raw_history:
            if msg.role == "user":
                history.append(ModelRequest(parts=[UserPromptPart(content=msg.content)]))
            elif msg.role == "assistant":
                history.append(ModelResponse(parts=[TextPart(content=msg.content)]))

        result = await agent.run(
            req.message,
            deps=deps,
            message_history=history if history else None,
            usage_limits=UsageLimits(request_limit=15),
        )

        resp_text = getattr(result, "output", getattr(result, "data", str(result)))
        return ChatResponse(
            response=str(resp_text),
            tool_calls=[],
            session_id=req.session_id or "default",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/stream")
async def chat_stream_endpoint(req: ChatRequest):
    deps = get_agent_deps(session_id=req.session_id or "default", folder=req.workspace)
    queue: asyncio.Queue = asyncio.Queue()
    deps.event_queue = queue

    try:
        agent = create_agent(req.model)
    except Exception:
        agent = create_agent(None)

    async def event_generator() -> AsyncGenerator[str, None]:
        raw_history = req.history
        if raw_history and raw_history[-1].role == "user" and raw_history[-1].content == req.message:
            raw_history = raw_history[:-1]

        history: list[ModelMessage] = []
        for msg in raw_history:
            if msg.role == "user":
                history.append(ModelRequest(parts=[UserPromptPart(content=msg.content)]))
            elif msg.role == "assistant":
                history.append(ModelResponse(parts=[TextPart(content=msg.content)]))

        try:
            yield f"data: {json.dumps({'type': 'thinking', 'status': 'start', 'content': 'Analyzing prompt and inspecting workspace...'})}\n\n"

            async with agent.run_stream(
                req.message,
                deps=deps,
                message_history=history if history else None,
                usage_limits=UsageLimits(request_limit=15),
            ) as stream:
                while not queue.empty():
                    act = queue.get_nowait()
                    yield f"data: {json.dumps(act)}\n\n"

                # Stream incremental delta text chunks and emit any queued tool events
                async for chunk in stream.stream_text(delta=True):
                    while not queue.empty():
                        act = queue.get_nowait()
                        yield f"data: {json.dumps(act)}\n\n"
                    yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"

            while not queue.empty():
                act = queue.get_nowait()
                yield f"data: {json.dumps(act)}\n\n"

            modified = list(dict.fromkeys(getattr(deps, "modified_files", [])))
            yield f"data: {json.dumps({'type': 'done', 'modified_files': modified, 'activities': deps.activities})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
