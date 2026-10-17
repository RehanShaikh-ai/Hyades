"""Extractors package and factory resolver per CONTRACT v0.4.2 §11.1.

Resolves extractor instances via get_extractor(source_type).
"""

from app.services.extractors.base import BaseExtractor, ExtractedContent
from app.services.extractors.csv_extractor import CsvExtractor
from app.services.extractors.docx_extractor import DocxExtractor
from app.services.extractors.epub_extractor import EpubExtractor
from app.services.extractors.html_extractor import HtmlExtractor
from app.services.extractors.image_extractor import ImageExtractor
from app.services.extractors.json_extractor import JsonExtractor
from app.services.extractors.text_and_pdf import PdfExtractor, TextExtractor

_EXTRACTOR_REGISTRY: dict[str, BaseExtractor] = {
    "pdf": PdfExtractor(),
    "markdown": TextExtractor(is_markdown=True),
    "text": TextExtractor(is_markdown=False),
    "txt": TextExtractor(is_markdown=False),
    "docx": DocxExtractor(),
    "html": HtmlExtractor(),
    "epub": EpubExtractor(),
    "json": JsonExtractor(),
    "csv": CsvExtractor(),
    "image": ImageExtractor(),
}


def get_extractor(source_type: str) -> BaseExtractor:
    """Resolve an extractor instance for the given source type per Contract §11.1.

    Args:
        source_type: Lowercase source format identifier (pdf, docx, html, epub, json, csv, image, markdown, text).

    Returns:
        BaseExtractor instance.

    Raises:
        ValueError: If source_type is not supported.
    """
    st = (source_type or "").lower().strip()
    if st in _EXTRACTOR_REGISTRY:
        return _EXTRACTOR_REGISTRY[st]
    raise ValueError(f"No extractor registered for source_type: '{source_type}'")


__all__ = [
    "BaseExtractor",
    "ExtractedContent",
    "get_extractor",
    "CsvExtractor",
    "DocxExtractor",
    "EpubExtractor",
    "HtmlExtractor",
    "ImageExtractor",
    "JsonExtractor",
    "PdfExtractor",
    "TextExtractor",
]
