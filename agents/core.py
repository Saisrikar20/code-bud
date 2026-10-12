import os
from dotenv import load_dotenv
from pydantic_ai import Agent, Tool
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider
from .context import AgentDeps
from .prompts import SYSTEM_PROMPT
from .functions import edit, ls, read, write, grep, find

load_dotenv()

def create_agent(model_name: str | None = None) -> Agent[AgentDeps]:
    """Factory function creating an Agent configured with LLM model and workspace tools."""
    selected = model_name or os.getenv("AGENT_MODEL") or "nvidia:z-ai/glm-5.3-flash"
    nvidia_key = os.getenv("NVIDIA_API_KEY")

    if selected.startswith("nvidia:") or (nvidia_key and any(k in selected for k in ("meta/", "nvidia/", "z-ai/", "openai/"))):
        model = OpenAIChatModel(selected.replace("nvidia:", ""), provider=OpenAIProvider(base_url="https://integrate.api.nvidia.com/v1", api_key=nvidia_key))
    else:
        model = selected

    return Agent(
        model=model,
        system_prompt=SYSTEM_PROMPT,
        deps_type=AgentDeps,
        retries=1,
        tools=[Tool(t, takes_ctx=True) for t in (ls, read, write, edit, grep, find)],
    )
