"""HTML file extractor.

Canonical module per CONTRACT v0.4.2 §11.3.
Extracts readable text from HTML documents, stripping script/style tags.
Imported HTML is never rendered directly in the application.
"""

from typing import Any

from app.services.extractors.base import BaseExtractor, ExtractedContent


class HtmlExtractor(BaseExtractor):
    """Extractor for HTML documents."""

    def extract(self, file_bytes: bytes, filename: str = "", **kwargs: Any) -> ExtractedContent:
        try:
            from bs4 import BeautifulSoup
        except ImportError as err:
            raise ValueError("beautifulsoup4 is not installed in the runtime environment.") from err

        try:
            # Try utf-8 first, with fallback
            text_input = file_bytes.decode("utf-8", errors="replace")
            soup = BeautifulSoup(text_input, "html.parser")
        except Exception as e:
            raise ValueError(f"Failed to parse HTML document: {e}") from e

        # Strip scripts, styles, forms, and embedded elements
        for element in soup(["script", "style", "noscript", "iframe", "svg", "object", "embed"]):
            element.decompose()

        title = soup.title.string.strip() if soup.title and soup.title.string else None

        # Extract text preserving structural line breaks
        text = soup.get_text(separator="\n", strip=True)

        metadata: dict[str, Any] = {
            "format": "html",
            "title": title,
            "word_count": len(text.split()) if text else 0,
        }

        return ExtractedContent(text=text, metadata=metadata)
