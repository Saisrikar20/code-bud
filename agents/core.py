import os
from dotenv import load_dotenv
from pydantic_ai import Agent, Tool
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider
from .context import AgentDeps
from .prompts import SYSTEM_PROMPT
from .functions import edit, ls, read, write, grep, find

# Load .env variables
load_dotenv()

def create_agent(model_name: str | None = None) -> Agent[AgentDeps]:
    """
    Factory function to create an Antigravity Agent instance configured with tools.
    Supports NVIDIA NIM models via OpenAI-compatible endpoints as well as Groq, Gemini, OpenAI.
    """
    selected = model_name or os.getenv("AGENT_MODEL") or "nvidia:z-ai/glm-5.3-flash"
    nvidia_key = os.getenv("NVIDIA_API_KEY")

    if selected.startswith("nvidia:") or (nvidia_key and ("meta/" in selected or "nvidia/" in selected or "z-ai/" in selected or "openai/" in selected)):
        raw_model = selected.replace("nvidia:", "")
        model_instance = OpenAIChatModel(
            raw_model,
            provider=OpenAIProvider(
                base_url="https://integrate.api.nvidia.com/v1",
                api_key=nvidia_key,
            ),
        )
    else:
        model_instance = selected

    agent = Agent(
        model=model_instance,
        system_prompt=SYSTEM_PROMPT,
        deps_type=AgentDeps,
        retries=1,
        tools=[
            Tool(ls, takes_ctx=True),
            Tool(read, takes_ctx=True),
            Tool(write, takes_ctx=True),
            Tool(edit, takes_ctx=True),
            Tool(grep, takes_ctx=True),
            Tool(find, takes_ctx=True),
        ],
    )
    return agent
