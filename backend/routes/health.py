from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["health"])

class HealthStatus(BaseModel):
    status: str
    version: str

@router.get("/health", response_model=HealthStatus)
async def health_check():
    return HealthStatus(status="ok", version="0.1.0")
