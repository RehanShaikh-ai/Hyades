"""Standard text and PDF extractors.

Provides unified extractor interface for existing formats (PDF, Markdown, plain text).
"""

import io
from typing import Any

from pypdf import PdfReader

from app.services.extractors.base import BaseExtractor, ExtractedContent


class PdfExtractor(BaseExtractor):
    """Extractor for PDF documents."""

    def extract(self, file_bytes: bytes, filename: str = "", **kwargs: Any) -> ExtractedContent:
        try:
            reader = PdfReader(io.BytesIO(file_bytes))
            pages_text: list[str] = []
            for page in reader.pages:
                t = page.extract_text()
                if t:
                    pages_text.append(t)
            full_text = "\n\n".join(pages_text)
            doc_title = None
            if reader.metadata and reader.metadata.title:
                doc_title = str(reader.metadata.title).strip()
            metadata = {
                "format": "pdf",
                "title": doc_title,
                "page_count": len(reader.pages),
                "word_count": len(full_text.split()) if full_text else 0,
            }
            return ExtractedContent(text=full_text, metadata=metadata)
        except Exception as e:
            raise ValueError(f"Failed to extract PDF: {e}") from e


class TextExtractor(BaseExtractor):
    """Extractor for plain text and Markdown files."""

    def __init__(self, is_markdown: bool = False):
        self.is_markdown = is_markdown

    def extract(self, file_bytes: bytes, filename: str = "", **kwargs: Any) -> ExtractedContent:
        try:
            text = file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            text = file_bytes.decode("latin-1", errors="replace")

        metadata = {
            "format": "markdown" if self.is_markdown else "text",
            "word_count": len(text.split()) if text else 0,
        }
        return ExtractedContent(text=text, metadata=metadata)
