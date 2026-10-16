"""JSON file extractor.

Canonical module per CONTRACT v0.4.2 §11.5.
Converts structured JSON into deterministic textual content while enforcing depth and size limits.
"""

import json
from typing import Any

from app.services.extractors.base import BaseExtractor, ExtractedContent


class JsonExtractor(BaseExtractor):
    """Extractor for JSON data structures."""

    def __init__(self, max_depth: int = 20, max_size_bytes: int = 10 * 1024 * 1024):
        self.max_depth = max_depth
        self.max_size_bytes = max_size_bytes

    def _check_depth(self, data: Any, current_depth: int = 0) -> None:
        if current_depth > self.max_depth:
            raise ValueError(f"JSON structure exceeds maximum nesting depth of {self.max_depth}")
        if isinstance(data, dict):
            for v in data.values():
                self._check_depth(v, current_depth + 1)
        elif isinstance(data, list):
            for item in data:
                self._check_depth(item, current_depth + 1)

    def _to_deterministic_text(self, data: Any, indent: int = 0) -> str:
        prefix = "  " * indent
        if isinstance(data, dict):
            lines = []
            for k in sorted(data.keys()):
                v = data[k]
                if isinstance(v, (dict, list)):
                    lines.append(f"{prefix}{k}:")
                    lines.append(self._to_deterministic_text(v, indent + 1))
                else:
                    lines.append(f"{prefix}{k}: {v}")
            return "\n".join(lines)
        elif isinstance(data, list):
            lines = []
            for item in data:
                if isinstance(item, (dict, list)):
                    lines.append(f"{prefix}-")
                    lines.append(self._to_deterministic_text(item, indent + 1))
                else:
                    lines.append(f"{prefix}- {item}")
            return "\n".join(lines)
        return f"{prefix}{data}"

    def extract(self, file_bytes: bytes, filename: str = "", **kwargs: Any) -> ExtractedContent:
        if len(file_bytes) > self.max_size_bytes:
            raise ValueError(f"JSON file size ({len(file_bytes)} bytes) exceeds limit ({self.max_size_bytes} bytes)")

        try:
            text_str = file_bytes.decode("utf-8")
            data = json.loads(text_str)
        except Exception as e:
            raise ValueError(f"Invalid JSON data: {e}") from e

        self._check_depth(data)
        deterministic_text = self._to_deterministic_text(data)

        metadata: dict[str, Any] = {
            "format": "json",
            "is_list": isinstance(data, list),
            "item_count": len(data) if isinstance(data, (dict, list)) else 1,
            "word_count": len(deterministic_text.split()),
        }

        return ExtractedContent(text=deterministic_text, metadata=metadata)
