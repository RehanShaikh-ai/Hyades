"""LLM provider service abstraction and implementations.

Canonical service per CONTRACT v0.3.1 §5.3, §11.1, §17.4.
Provides BaseLLMProvider, generate, generate_stream, health_check.
"""

import json
import logging
from collections.abc import Iterator
from typing import Any

import httpx

from app.core.config import settings
from app.core.exceptions import LLMProviderUnavailableError, LLMTimeoutError

logger = logging.getLogger("app.services.llm_service")


class BaseLLMProvider:
    """Base class for all LLM providers per CONTRACT §11.1."""

    supports_json_object: bool = True
    supports_json_schema: bool = False

    def provider_name(self) -> str:
        raise NotImplementedError

    def model_name(self) -> str:
        raise NotImplementedError

    def generate(self, messages: list[dict[str, Any]], **kwargs) -> str:
        raise NotImplementedError

    def generate_stream(self, messages: list[dict[str, Any]], **kwargs) -> Iterator[str]:
        raise NotImplementedError

    def health_check(self) -> bool:
        raise NotImplementedError


def is_transient_error(exc: Exception) -> bool:
    """Classify whether an exception is a transient error eligible for retry."""
    from app.core.exceptions import LLMProviderUnavailableError, LLMTimeoutError

    # Authentication and permission errors must fail fast without retry
    msg = str(exc).lower()
    if any(
        auth_term in msg
        for auth_term in (
            "401",
            "403",
            "unauthorized",
            "forbidden",
            "invalid api key",
            "authentication failed",
        )
    ):
        return False

    if isinstance(exc, LLMTimeoutError):
        return True
    if isinstance(exc, (httpx.TimeoutException, httpx.ConnectError, httpx.ReadTimeout)):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in (408, 429, 500, 502, 503, 504)
    if isinstance(exc, LLMProviderUnavailableError):
        if any(
            code in msg
            for code in (
                "502",
                "503",
                "504",
                "429",
                "timed out",
                "timeout",
                "temporarily unavailable",
            )
        ):
            return True
        if (
            "500 internal server error" in msg
            or "status code 500" in msg
            or "http status 500" in msg
        ):
            return True
    return any(
        term in msg for term in ("timed out", "timeout", "connection reset", "502", "503", "504")
    )


class DeterministicTestProvider(BaseLLMProvider):
    """Deterministic test provider for CI and offline development per CONTRACT §17.4."""

    def __init__(self, model: str | None = None) -> None:
        self._model = model or "test-model-v1"

    def provider_name(self) -> str:
        return "deterministic_test"

    def model_name(self) -> str:
        return self._model

    def generate(self, messages: list[dict[str, Any]], **kwargs) -> str:
        all_text = " ".join(m.get("content", "") for m in messages)
        last_msg = messages[-1]["content"] if messages else ""

        # Check if this is entity extraction
        if "entity extraction" in all_text.lower() or "extract entities" in all_text.lower():
            # Find candidate capitalized phrases or keywords from text
            text_to_extract = (
                last_msg.split("Extract entities from this text:\n\n")[-1]
                if "Extract entities from this text:\n\n" in last_msg
                else last_msg
            )
            candidates = []
            # Find capitalized word sequences
            import re

            caps = re.findall(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b", text_to_extract)
            for c in caps:
                if (
                    c.lower()
                    not in {"extract", "entities", "text", "the", "this", "short", "only", "json"}
                    and len(c) > 2
                ):
                    if c not in candidates:
                        candidates.append(c)
            if not candidates:
                # Default concepts
                words = [w.strip() for w in text_to_extract.split() if len(w) > 4][:3]
                candidates = [w.capitalize() for w in words] or ["Concept"]

            entities = [
                {
                    "name": name,
                    "type": "concept",
                    "description": f"Extracted concept of {name}",
                }
                for name in candidates[:5]
            ]
            return json.dumps({"entities": entities})

        # Check if this is relationship extraction
        if (
            "relationship extraction" in all_text.lower()
            or "extract relationships" in all_text.lower()
        ):
            import re

            entities_match = re.search(r"Entities identified:\s*\[(.*?)\]", all_text)
            entity_names = []
            if entities_match:
                entity_names = [
                    e.strip(" '\"") for e in entities_match.group(1).split(",") if e.strip(" '\"")
                ]

            relationships = []
            if len(entity_names) >= 2:
                for i in range(len(entity_names) - 1):
                    relationships.append(
                        {
                            "source": entity_names[i],
                            "target": entity_names[i + 1],
                            "type": "related_to",
                            "description": f"{entity_names[i]} relates to {entity_names[i + 1]}",
                            "confidence": 0.85,
                        }
                    )
            return json.dumps({"relationships": relationships})

        preview = last_msg[:80]
        return f"Based on your knowledge base: Verified answer regarding: {preview}"

    def generate_stream(self, messages: list[dict[str, Any]], **kwargs) -> Iterator[str]:
        full_text = self.generate(messages, **kwargs)
        for word in full_text.split():
            yield word + " "

    def health_check(self) -> bool:
        return True


class OllamaLLMProvider(BaseLLMProvider):
    """Ollama local LLM provider."""

    def __init__(self, base_url: str | None = None, model: str | None = None) -> None:
        self.base_url = (base_url or settings.OLLAMA_BASE_URL).rstrip("/")
        self._model = model or settings.LLM_MODEL

    def provider_name(self) -> str:
        return "ollama"

    def model_name(self) -> str:
        return self._model

    def generate(self, messages: list[dict[str, Any]], **kwargs) -> str:
        try:
            with httpx.Client(timeout=settings.PROVIDER_TIMEOUT_SECONDS) as client:
                res = client.post(
                    f"{self.base_url}/api/chat",
                    json={
                        "model": self._model,
                        "messages": messages,
                        "stream": False,
                    },
                )
                if res.status_code != 200:
                    raise LLMProviderUnavailableError(
                        f"Ollama returned HTTP status {res.status_code}"
                    )
                data = res.json()
                return data.get("message", {}).get("content", "")
        except httpx.TimeoutException as e:
            raise LLMTimeoutError("LLM request timed out.") from e
        except httpx.RequestError as e:
            raise LLMProviderUnavailableError("LLM provider unreachable.") from e
        except Exception as e:
            raise LLMProviderUnavailableError("LLM generation failed.") from e

    def generate_stream(self, messages: list[dict[str, Any]], **kwargs) -> Iterator[str]:
        try:
            with httpx.Client(timeout=settings.PROVIDER_TIMEOUT_SECONDS) as client:
                with client.stream(
                    "POST",
                    f"{self.base_url}/api/chat",
                    json={
                        "model": self._model,
                        "messages": messages,
                        "stream": True,
                    },
                ) as response:
                    for line in response.iter_lines():
                        if line:
                            data = json.loads(line)
                            content = data.get("message", {}).get("content", "")
                            if content:
                                yield content
        except httpx.TimeoutException as e:
            raise LLMTimeoutError("LLM request timed out.") from e
        except Exception as e:
            raise LLMProviderUnavailableError("LLM streaming failed.") from e

    def health_check(self) -> bool:
        try:
            with httpx.Client(timeout=3.0) as client:
                res = client.get(f"{self.base_url}/api/tags")
                return res.status_code == 200
        except Exception:
            return False


class OmniRouteLLMProvider(BaseLLMProvider):
    """OmniRoute LLM provider."""

    def __init__(self, base_url: str | None = None, model: str | None = None) -> None:
        self.base_url = (base_url or settings.OMNIROUTE_BASE_URL).rstrip("/")
        self._model = model or settings.LLM_MODEL

    def provider_name(self) -> str:
        return "omniroute"

    def model_name(self) -> str:
        return self._model

    def generate(self, messages: list[dict[str, Any]], **kwargs) -> str:
        if not self.base_url:
            raise LLMProviderUnavailableError("OmniRoute base URL is not configured.")
        try:
            with httpx.Client(timeout=settings.PROVIDER_TIMEOUT_SECONDS) as client:
                res = client.post(
                    f"{self.base_url}/chat/completions",
                    json={"model": self._model, "messages": messages},
                )
                if res.status_code != 200:
                    raise LLMProviderUnavailableError("OmniRoute request failed.")
                return res.json().get("choices", [{}])[0].get("message", {}).get("content", "")
        except httpx.TimeoutException as e:
            raise LLMTimeoutError("OmniRoute request timed out.") from e
        except Exception as e:
            raise LLMProviderUnavailableError("OmniRoute provider unreachable.") from e

    def generate_stream(self, messages: list[dict[str, Any]], **kwargs) -> Iterator[str]:
        full_text = self.generate(messages, **kwargs)
        for chunk in full_text.split():
            yield chunk + " "

    def health_check(self) -> bool:
        if not self.base_url:
            return False
        try:
            with httpx.Client(timeout=3.0) as client:
                return client.get(f"{self.base_url}/health").status_code == 200
        except Exception:
            return False


def _auto_discover_freellmapi_key() -> str | None:
    """Helper to auto-discover local FreeLLMAPI unified key if running locally."""
    try:
        import sqlite3
        from pathlib import Path

        possible_paths = [
            Path("/app/freellmapi/server/data/freeapi.db"),
            Path("/data/freellmapi/server/data/freeapi.db"),
            Path.home() / "freellmapi/server/data/freeapi.db",
            Path("/home/rehan/freellmapi/server/data/freeapi.db"),
            Path(r"C:\Users\rehan\OneDrive\Desktop\Personal\freellmapi\server\data\freeapi.db"),
            Path(r"..\freellmapi\server\data\freeapi.db"),
        ]
        for p in possible_paths:
            if p.exists():
                conn = sqlite3.connect(str(p))
                row = (
                    conn.cursor()
                    .execute("SELECT value FROM settings WHERE key = 'unified_api_key'")
                    .fetchone()
                )
                conn.close()
                if row and row[0]:
                    return str(row[0])
    except Exception:
        pass
    return None


RECOMMENDED_MODELS: list[dict[str, Any]] = [
    {
        "id": "auto",
        "name": "Auto-Route (Recommended)",
        "description": "Dynamic failover across fastest available upstream routes",
        "context_window": 131072,
    },
    {
        "id": "gemini-flash-lite",
        "name": "Gemini Flash Lite",
        "description": "Fast low-latency Google Flash model for rapid synthesis",
        "context_window": 131072,
    },
    {
        "id": "qwen2.5-coder-7b-instruct",
        "name": "Qwen 2.5 Coder 7B",
        "description": "Fast reasoning & structured outputs (131k context)",
        "context_window": 131072,
    },
    {
        "id": "gemma-3-4b-it",
        "name": "Gemma 3 4B IT",
        "description": "Google lightweight instruction model (131k context)",
        "context_window": 131072,
    },
    {
        "id": "phi-4",
        "name": "Phi-4",
        "description": "Microsoft compact model with strong grounding (16k context)",
        "context_window": 16384,
    },
    {
        "id": "command-r",
        "name": "Command R",
        "description": "Cohere model optimized for RAG and citations (131k context)",
        "context_window": 131072,
    },
]


class FreeLLMAPILMProvider(BaseLLMProvider):
    supports_json_object: bool = False
    """FreeLLMAPI provider with real token streaming and health checking."""

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
    ) -> None:
        raw_url = base_url or settings.FREELLMAPI_BASE_URL or "http://localhost:3001"
        self.base_url = raw_url.rstrip("/")
        self.api_key = api_key or settings.FREELLMAPI_API_KEY or _auto_discover_freellmapi_key()
        # Default to 'auto' for FreeLLMAPI dynamic routing if generic/empty model is set
        m = model or settings.LLM_MODEL
        self._model = "auto" if m in ("llama3.2", "default", "", None) else m

    def _endpoint(self, path: str) -> str:
        url = self.base_url.rstrip("/")
        if not url.endswith("/v1"):
            url += "/v1"
        return f"{url}/{path.lstrip('/')}"

    def provider_name(self) -> str:
        return "freellmapi"

    def model_name(self) -> str:
        return self._model

    def generate(self, messages: list[dict[str, Any]], **kwargs) -> str:
        if not self.base_url:
            raise LLMProviderUnavailableError("FreeLLMAPI base URL is not configured.")
        if not self.api_key:
            raise LLMProviderUnavailableError(
                "FreeLLMAPI unified API key is not configured. Set FREELLMAPI_API_KEY in the environment or ensure FreeLLMAPI is initialized locally."
            )
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {self.api_key}"}
        payload: dict[str, Any] = {"model": self._model, "messages": messages}
        if "response_format" in kwargs and kwargs["response_format"]:
            payload["response_format"] = kwargs["response_format"]
        try:
            with httpx.Client(timeout=settings.PROVIDER_TIMEOUT_SECONDS) as client:
                res = client.post(
                    self._endpoint("chat/completions"),
                    headers=headers,
                    json=payload,
                )
                if res.status_code == 401:
                    raise LLMProviderUnavailableError(
                        "FreeLLMAPI authentication failed (401 Unauthorized): invalid or missing unified API key."
                    )
                elif res.status_code == 404:
                    raise LLMProviderUnavailableError(
                        f"FreeLLMAPI model '{self._model}' not found (404). Please select an active model."
                    )
                elif res.status_code != 200:
                    err_detail = res.text[:200]
                    raise LLMProviderUnavailableError(
                        f"FreeLLMAPI request failed with status {res.status_code}: {err_detail}"
                    )
                return res.json().get("choices", [{}])[0].get("message", {}).get("content", "")
        except httpx.TimeoutException as e:
            raise LLMTimeoutError("FreeLLMAPI request timed out.") from e
        except Exception as e:
            if isinstance(e, (LLMTimeoutError, LLMProviderUnavailableError)):
                raise
            raise LLMProviderUnavailableError(f"FreeLLMAPI provider unreachable: {e}") from e

    def generate_stream(self, messages: list[dict[str, Any]], **kwargs) -> Iterator[str]:
        """Real token streaming directly from FreeLLMAPI via SSE."""
        if not self.base_url:
            raise LLMProviderUnavailableError("FreeLLMAPI base URL is not configured.")
        if not self.api_key:
            raise LLMProviderUnavailableError(
                "FreeLLMAPI unified API key is not configured. Set FREELLMAPI_API_KEY in the environment or ensure FreeLLMAPI is initialized locally."
            )
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {self.api_key}"}
        try:
            with httpx.Client(timeout=settings.PROVIDER_TIMEOUT_SECONDS) as client:
                with client.stream(
                    "POST",
                    self._endpoint("chat/completions"),
                    headers=headers,
                    json={"model": self._model, "messages": messages, "stream": True},
                ) as response:
                    if response.status_code == 401:
                        raise LLMProviderUnavailableError(
                            "FreeLLMAPI authentication failed (401 Unauthorized): invalid or missing unified API key."
                        )
                    elif response.status_code == 404:
                        raise LLMProviderUnavailableError(
                            f"FreeLLMAPI model '{self._model}' not found (404). Please select an active model."
                        )
                    elif response.status_code != 200:
                        raise LLMProviderUnavailableError(
                            f"FreeLLMAPI streaming failed with status {response.status_code}."
                        )
                    for line in response.iter_lines():
                        if not line:
                            continue
                        if line.startswith("data: "):
                            raw_data = line[6:].strip()
                            if raw_data == "[DONE]":
                                break
                            try:
                                payload = json.loads(raw_data)
                                choices = payload.get("choices", [])
                                if choices:
                                    delta = choices[0].get("delta", {})
                                    content = delta.get("content", "")
                                    if content:
                                        yield content
                            except json.JSONDecodeError:
                                continue
        except httpx.TimeoutException as e:
            raise LLMTimeoutError("FreeLLMAPI request timed out.") from e
        except Exception as e:
            raise LLMProviderUnavailableError(f"FreeLLMAPI streaming failed: {e}") from e

    def health_check(self) -> bool:
        if not self.base_url:
            return False
        try:
            with httpx.Client(timeout=3.0) as client:
                headers = {}
                if not self.api_key:
                    return False
                headers["Authorization"] = f"Bearer {self.api_key}"
                res = client.get(self._endpoint("models"), headers=headers)
                return res.status_code == 200
        except Exception:
            return False


def get_llm_provider(model: str | None = None) -> BaseLLMProvider:
    """Factory selecting provider based on LLM_PROVIDER or environment."""
    if settings.APP_ENV == "testing":
        return DeterministicTestProvider(model=model)

    p_name = settings.LLM_PROVIDER.lower()
    if p_name == "freellmapi":
        provider = FreeLLMAPILMProvider(model=model)
        if provider.health_check():
            return provider
        logger.warning(
            "FreeLLMAPI configured but unreachable at %s. Checking Ollama fallback.",
            provider.base_url,
        )
        ollama_provider = OllamaLLMProvider(model=model)
        if ollama_provider.health_check():
            return ollama_provider
        # Do NOT silently fake answers in normal usage
        raise LLMProviderUnavailableError(f"FreeLLMAPI is unreachable at {provider.base_url}.")

    if p_name == "ollama":
        provider = OllamaLLMProvider(model=model)
        if provider.health_check():
            return provider
        raise LLMProviderUnavailableError("Ollama provider is unreachable.")

    if p_name == "omniroute":
        provider = OmniRouteLLMProvider(model=model)
        if provider.health_check():
            return provider
        raise LLMProviderUnavailableError("OmniRoute provider is unreachable.")

    provider = FreeLLMAPILMProvider(model=model)
    if provider.health_check():
        return provider
    raise LLMProviderUnavailableError("No LLM provider is currently reachable.")


def generate(messages: list[dict[str, Any]], model: str | None = None, **kwargs) -> str:
    """Canonical generate function per CONTRACT §5.3."""
    provider = get_llm_provider(model=model)
    return provider.generate(messages, **kwargs)


def generate_stream(
    messages: list[dict[str, Any]], model: str | None = None, **kwargs
) -> Iterator[str]:
    """Canonical generate_stream function per CONTRACT §5.3."""
    provider = get_llm_provider(model=model)
    return provider.generate_stream(messages, **kwargs)


def health_check() -> bool:
    """Canonical health_check function per CONTRACT §5.3."""
    try:
        provider = get_llm_provider()
        return provider.health_check()
    except Exception:
        return False
