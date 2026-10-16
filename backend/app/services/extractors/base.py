"""Base extractor contract and data classes.

Canonical module per CONTRACT v0.4.2 §11.1.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
import io
from typing import Any
import zipfile


@dataclass
class ExtractedContent:
    """Standard container for content extracted from a source file."""

    text: str
    metadata: dict[str, Any] = field(default_factory=dict)


def safe_open_zip(
    file_bytes: bytes,
    max_uncompressed_bytes: int = 100 * 1024 * 1024,  # 100 MB max uncompressed
    max_files: int = 5000,
    max_ratio: float = 100.0,
) -> zipfile.ZipFile:
    """Open and validate a ZIP archive against zip-bomb and resource exhaustion attacks.

    Contract §11.2, §11.4: DOCX and EPUB are ZIP-based and must use safe archive limits.
    """
    try:
        zf = zipfile.ZipFile(io.BytesIO(file_bytes))
    except zipfile.BadZipFile as e:
        raise ValueError(f"Invalid or corrupted ZIP archive: {e}") from e

    infolist = zf.infolist()
    if len(infolist) > max_files:
        raise ValueError(f"Archive exceeds maximum file count limit ({len(infolist)} > {max_files})")

    total_uncompressed = 0
    compressed_size = max(len(file_bytes), 1)

    for info in infolist:
        total_uncompressed += info.file_size
        if total_uncompressed > max_uncompressed_bytes:
            raise ValueError(
                f"Archive exceeds maximum uncompressed size ({total_uncompressed} > {max_uncompressed_bytes})"
            )
        if info.compress_size > 0:
            ratio = info.file_size / info.compress_size
            if ratio > max_ratio and info.file_size > 1024 * 1024:
                raise ValueError(
                    f"Suspicious compression ratio ({ratio:.1f}:1) for entry '{info.filename}' exceeds limit ({max_ratio}:1)"
                )

    return zf


class BaseExtractor(ABC):
    """Abstract base class for all file extractors."""

    @abstractmethod
    def extract(self, file_bytes: bytes, filename: str = "", **kwargs: Any) -> ExtractedContent:
        """Extract readable text and metadata from raw file bytes."""
        raise NotImplementedError
