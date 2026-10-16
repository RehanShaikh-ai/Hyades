"""Image file validator and metadata extractor.

Canonical module per CONTRACT v0.4.2 §11.7.
Raster image formats only (JPEG, PNG, WEBP, GIF).
Rejects SVG explicitly.
Does not run OCR, vision models, captions, visual embeddings, or entity extraction.
Exposes MIME type plus width/height/format.
"""

import io
from typing import Any
from PIL import Image

from app.services.extractors.base import BaseExtractor, ExtractedContent


class ImageExtractor(BaseExtractor):
    """Extractor for raster images."""

    ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "GIF"}

    def extract(self, file_bytes: bytes, filename: str = "", **kwargs: Any) -> ExtractedContent:
        # Reject SVG by explicit signature/header check
        sample = file_bytes[:1024].lower()
        if b"<svg" in sample or b"<?xml" in sample and b"svg" in sample:
            raise ValueError("SVG images are not supported per Contract §11.7. Raster formats only.")

        try:
            img = Image.open(io.BytesIO(file_bytes))
            img_format = (img.format or "").upper()
        except Exception as e:
            raise ValueError(f"Invalid image file: {e}") from e

        if img_format not in self.ALLOWED_FORMATS:
            raise ValueError(
                f"Unsupported image format '{img_format}'. Supported formats: {', '.join(sorted(self.ALLOWED_FORMATS))}"
            )

        mime_map = {
            "JPEG": "image/jpeg",
            "PNG": "image/png",
            "WEBP": "image/webp",
            "GIF": "image/gif",
        }
        mime_type = mime_map.get(img_format, f"image/{img_format.lower()}")

        metadata: dict[str, Any] = {
            "format": img_format.lower(),
            "width": img.width,
            "height": img.height,
            "mode": img.mode,
            "mime_type": mime_type,
        }

        # Contract §11.7: No OCR, captions, or entity extraction. Empty or description-only text.
        text_desc = f"[Image: {filename or 'source'}, {img.width}x{img.height} {img_format}]"

        return ExtractedContent(text=text_desc, metadata=metadata)
