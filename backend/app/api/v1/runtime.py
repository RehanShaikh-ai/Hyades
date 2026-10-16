"""FreeLLMAPI runtime management and status endpoints."""

from typing import Any
from fastapi import APIRouter, status
from pydantic import BaseModel, Field

from app.services import runtime_service

router = APIRouter(prefix="/runtime/freellmapi", tags=["runtime"])


class TestConnectionRequest(BaseModel):
    endpoint: str | None = None
    api_key: str | None = None


class StartServiceResponse(BaseModel):
    success: bool
    message: str
    status: str
    pid: int | None = None
    endpoint: str | None = None


@router.get("/status")
def get_freellmapi_status() -> dict[str, Any]:
    """Check FreeLLMAPI discovery status and local service health."""
    return runtime_service.check_freellmapi_health()


@router.post("/test")
def test_freellmapi_connection(req: TestConnectionRequest) -> dict[str, Any]:
    """Test connectivity to a FreeLLMAPI endpoint."""
    return runtime_service.check_freellmapi_health(
        base_url=req.endpoint,
        api_key=req.api_key,
        timeout_seconds=3.0,
    )


@router.post("/start", response_model=StartServiceResponse)
def start_freellmapi() -> StartServiceResponse:
    """Explicitly start local FreeLLMAPI service in background."""
    res = runtime_service.start_freellmapi_service()
    return StartServiceResponse(**res)


@router.post("/stop")
def stop_freellmapi() -> dict[str, Any]:
    """Stop managed FreeLLMAPI background service."""
    return runtime_service.stop_freellmapi_service()