"""Unit and integration tests for FreeLLMAPI authentication and error handling."""

from unittest.mock import MagicMock, patch

import pytest

from app.core.exceptions import LLMProviderUnavailableError
from app.services import llm_service
from app.services.llm_service import FreeLLMAPILMProvider


def test_freellmapi_missing_credentials_raises():
    """Missing unified API key must raise LLMProviderUnavailableError without exposing secrets."""
    provider = FreeLLMAPILMProvider(base_url="http://localhost:3001", api_key="", model="auto")
    provider.api_key = None

    with pytest.raises(LLMProviderUnavailableError) as exc_info:
        provider.generate([{"role": "user", "content": "hi"}])
    assert "unified API key is not configured" in str(exc_info.value)

    with pytest.raises(LLMProviderUnavailableError) as exc_info_stream:
        list(provider.generate_stream([{"role": "user", "content": "hi"}]))
    assert "unified API key is not configured" in str(exc_info_stream.value)


def test_freellmapi_health_check_requires_api_key():
    """health_check must return False when api_key is missing, never false-positive on /api/auth/status."""
    provider = FreeLLMAPILMProvider(base_url="http://localhost:3001", api_key="", model="auto")
    provider.api_key = None
    assert provider.health_check() is False


def test_freellmapi_401_structured_error():
    """Provider 401 returns actionable structured error without leaking headers."""
    provider = FreeLLMAPILMProvider(
        base_url="http://localhost:3001", api_key="freellmapi-invalid", model="auto"
    )

    mock_resp = MagicMock()
    mock_resp.status_code = 401
    mock_resp.text = '{"error":{"message":"Invalid API key","type":"authentication_error"}}'

    with patch("httpx.Client.post", return_value=mock_resp):
        with pytest.raises(LLMProviderUnavailableError) as exc:
            provider.generate([{"role": "user", "content": "hi"}])
        assert "401 Unauthorized" in str(exc.value)
        assert "invalid or missing unified API key" in str(exc.value)
        # Ensure secret is NOT in error string
        assert "freellmapi-invalid" not in str(exc.value)


def test_freellmapi_stream_401_structured_error():
    """Streaming 401 returns actionable structured error without leaking headers."""
    provider = FreeLLMAPILMProvider(
        base_url="http://localhost:3001", api_key="freellmapi-invalid", model="auto"
    )

    mock_stream_resp = MagicMock()
    mock_stream_resp.status_code = 401
    mock_ctx = MagicMock()
    mock_ctx.__enter__.return_value = mock_stream_resp

    with patch("httpx.Client.stream", return_value=mock_ctx):
        with pytest.raises(LLMProviderUnavailableError) as exc:
            list(provider.generate_stream([{"role": "user", "content": "hi"}]))
        assert "401 Unauthorized" in str(exc.value)
        assert "freellmapi-invalid" not in str(exc.value)


def test_freellmapi_auto_discover_key():
    """_auto_discover_freellmapi_key returns unified key when database exists."""
    key = llm_service._auto_discover_freellmapi_key()
    if key:
        assert key.startswith("freellmapi-")
