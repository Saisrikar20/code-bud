import json
import asyncio
from typing import AsyncGenerator
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic_ai.messages import ModelMessage, ModelRequest, ModelResponse, UserPromptPart, TextPart
from pydantic_ai.usage import UsageLimits
from shared.models import ChatRequest, ChatResponse, ToolCallEvent, TokenUsage
from shared.config import load_config
from agents.core import create_agent
from agents.context import AgentDeps
from ..dependencies import get_agent_deps

router = APIRouter(prefix="/chat", tags=["chat"])

def extract_usage(run_result_or_stream) -> TokenUsage:
    """Safely extracts token usage metrics from Pydantic AI run results or streams."""
    try:
        usage = getattr(run_result_or_stream, "usage", None)
        if callable(usage):
            usage = usage()
        if usage is not None:
            inp = getattr(usage, "input_tokens", 0) or 0
            out = getattr(usage, "output_tokens", 0) or 0
            tot = getattr(usage, "total_tokens", 0) or (inp + out)
            reqs = getattr(usage, "requests", 1) or 1
            return TokenUsage(
                input_tokens=int(inp),
                output_tokens=int(out),
                total_tokens=int(tot),
                requests=int(reqs),
            )
    except Exception:
        pass
    return TokenUsage(input_tokens=0, output_tokens=0, total_tokens=0, requests=1)

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
        usage_data = extract_usage(result)
        return ChatResponse(
            response=str(resp_text),
            tool_calls=[],
            session_id=req.session_id or "default",
            usage=usage_data,
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

            usage_obj = extract_usage(stream)
            usage_dict = usage_obj.model_dump() if hasattr(usage_obj, "model_dump") else usage_obj.dict()
            yield f"data: {json.dumps({'type': 'usage', 'usage': usage_dict})}\n\n"

            modified = list(dict.fromkeys(getattr(deps, "modified_files", [])))
            yield f"data: {json.dumps({'type': 'done', 'modified_files': modified, 'activities': deps.activities, 'usage': usage_dict})}\n\n"
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
