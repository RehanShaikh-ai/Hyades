"""Document preview and conversion service.

Generates sanitized Markdown preview representations of supported documents
without altering the original file on disk. Evaluates Microsoft's MarkItDown
or internal extractors. Enforces script/macro sanitization.
"""

import logging
import os
import re
import uuid
from typing import Any

from fastapi import status

from app.core.exceptions import AppException

logger = logging.getLogger(__name__)

# Check for Microsoft's MarkItDown availability
try:
    import markitdown

    HAS_MARKITDOWN = True
except ImportError:
    HAS_MARKITDOWN = False


class PreviewConversionError(AppException):
    """Raised when document preview conversion fails or is unsupported."""

    def __init__(self, message: str = "Document preview conversion failed.") -> None:
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            code="PREVIEW_UNSUPPORTED",
            message=message,
        )


def sanitize_markdown(content: str) -> str:
    """Sanitize rendered content to remove executable scripts, macros, and unsafe HTML tags.

    Preserves readable formatting, headers, paragraphs, and safe inline styling.
    """
    if not content:
        return ""

    # Strip HTML script, iframe, object, embed, style tags and content
    cleaned = re.sub(
        r"<(script|iframe|object|embed|style)[^>]*>.*?</(script|iframe|object|embed|style)>",
        "",
        content,
        flags=re.IGNORECASE | re.DOTALL,
    )
    # Strip self-closing or unclosed unsafe tags
    cleaned = re.sub(r"<(script|iframe|object|embed|style)[^>]*>", "", cleaned, flags=re.IGNORECASE)
    # Strip javascript: and inline event handlers (e.g., onload=, onerror=, onclick=)
    cleaned = re.sub(r'on[a-zA-Z]+\s*=\s*["\'][^"\']*["\']', "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"javascript:[^\\s\\)]+", "#", cleaned, flags=re.IGNORECASE)
    # Also strip javascript and vbscript URIs
    cleaned = re.sub(r"javascript:[^\\s\\)]+", "#", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"vbscript:[^\\s\\)]+", "#", cleaned, flags=re.IGNORECASE)

    return cleaned.strip()


def convert_docx_to_markdown(file_bytes: bytes) -> str:
    """Convert DOCX file bytes to clean Markdown paragraphs and headings."""
    import io

    try:
        import docx

        doc = docx.Document(io.BytesIO(file_bytes))
        md_lines = []
        for p in doc.paragraphs:
            text = p.text.strip()
            if not text:
                continue
            style_name = (p.style.name or "").lower() if p.style else ""
            if "heading 1" in style_name:
                md_lines.append(f"# {text}\n")
            elif "heading 2" in style_name:
                md_lines.append(f"## {text}\n")
            elif "heading 3" in style_name:
                md_lines.append(f"### {text}\n")
            elif "list" in style_name:
                md_lines.append(f"* {text}")
            else:
                md_lines.append(f"{text}\n")

        # Also extract table text
        for table in doc.tables:
            table_rows = []
            for row in table.rows:
                cells = [c.text.strip().replace("\n", " ") for c in row.cells]
                table_rows.append(" | ".join(cells))
            if table_rows:
                md_lines.append("\n" + "\n".join(table_rows) + "\n")

        return "\n".join(md_lines).strip()
    except Exception as e:
        logger.warning("DOCX custom extraction failed, falling back: %s", e)
        raise PreviewConversionError(f"DOCX preview conversion failed: {e}") from e


def generate_source_preview(
    source_id: uuid.UUID,
    original_path: str,
    source_type: str,
    file_bytes: bytes | None,
    raw_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Generate a sanitized Markdown preview representation for a source without modifying original file."""
    meta = raw_metadata or {}
    clean_filename = os.path.basename(original_path or "document")
    ext = os.path.splitext(clean_filename)[1].lower()
    title = meta.get("title") or clean_filename

    # If file bytes are not supplied, attempt to read from storage_path
    if not file_bytes:
        storage_path = meta.get("storage_path")
        if storage_path and os.path.exists(storage_path):
            try:
                with open(storage_path, "rb") as f:
                    file_bytes = f.read()
            except Exception as e:
                logger.warning("Could not read file from storage_path: %s", e)

    # If still no file bytes, fallback to extracted_text if available
    extracted_text = meta.get("extracted_text") or meta.get("excerpt")

    markdown_content = ""
    is_converted = False
    converter_used = "native"

    # Unsupported formats check (images, executables, binaries)
    if ext in (".exe", ".dll", ".bin", ".iso", ".zip", ".tar", ".gz", ".7z") or source_type in (
        "image",
        "binary",
    ):
        raise PreviewConversionError(
            f"Document format '{ext or source_type}' is not supported for text preview."
        )

    # 1. Native Markdown
    if ext in (".md", ".markdown") or source_type == "markdown":
        if file_bytes:
            markdown_content = file_bytes.decode("utf-8", errors="replace")
        elif extracted_text:
            markdown_content = extracted_text
        else:
            markdown_content = f"# {title}\n\n*Empty document.*"
        converter_used = "native_markdown"

    # 2. Plain Text
    elif ext in (".txt", ".text") or source_type == "text":
        if file_bytes:
            text = file_bytes.decode("utf-8", errors="replace")
        elif extracted_text:
            text = extracted_text
        else:
            text = "*Empty document.*"
        # Wrap as clean Markdown
        markdown_content = f"# {title}\n\n{text}"
        is_converted = True
        converter_used = "text_to_markdown"

    # 3. Microsoft Word (.docx)
    elif ext == ".docx" or source_type == "docx":
        if file_bytes:
            if HAS_MARKITDOWN:
                try:
                    import io

                    md = markitdown.MarkItDown()
                    res = md.convert_stream(io.BytesIO(file_bytes), file_extension=".docx")
                    markdown_content = res.text_content
                    converter_used = "markitdown_docx"
                    is_converted = True
                except Exception as ex:
                    logger.info("MarkItDown conversion failed, using docx extractor: %s", ex)
                    markdown_content = convert_docx_to_markdown(file_bytes)
                    converter_used = "docx_extractor"
                    is_converted = True
            else:
                markdown_content = convert_docx_to_markdown(file_bytes)
                converter_used = "docx_extractor"
                is_converted = True
        elif extracted_text:
            markdown_content = f"# {title}\n\n{extracted_text}"
            is_converted = True
            converter_used = "cached_extracted_text"
        else:
            raise PreviewConversionError(f"No content available to preview for '{clean_filename}'.")

    # 4. EPUB (.epub)
    elif ext == ".epub" or source_type == "epub":
        if file_bytes:
            from app.services.extractors.epub_extractor import extract_text

            text, _ = extract_text(file_bytes, clean_filename)
            markdown_content = f"# {title}\n\n{text}"
            is_converted = True
            converter_used = "epub_extractor"
        elif extracted_text:
            markdown_content = f"# {title}\n\n{extracted_text}"
            is_converted = True
            converter_used = "cached_extracted_text"
        else:
            raise PreviewConversionError(f"No content available to preview for '{clean_filename}'.")

    # 5. HTML (.html, .htm)
    elif ext in (".html", ".htm") or source_type == "html":
        if file_bytes:
            from app.services.extractors.html_extractor import extract_text

            text, _ = extract_text(file_bytes, clean_filename)
            markdown_content = f"# {title}\n\n{text}"
            is_converted = True
            converter_used = "html_extractor"
        elif extracted_text:
            markdown_content = f"# {title}\n\n{extracted_text}"
            is_converted = True
            converter_used = "cached_extracted_text"
        else:
            raise PreviewConversionError(f"No content available to preview for '{clean_filename}'.")

    # 6. PDF (.pdf)
    elif ext == ".pdf" or source_type == "pdf":
        if file_bytes:
            from app.services.extractors.text_and_pdf import extract_text_and_pdf

            text, _ = extract_text_and_pdf(file_bytes, clean_filename)
            markdown_content = f"# {title}\n\n{text}"
            is_converted = True
            converter_used = "pdf_extractor"
        elif extracted_text:
            markdown_content = f"# {title}\n\n{extracted_text}"
            is_converted = True
            converter_used = "cached_extracted_text"
        else:
            raise PreviewConversionError(f"No content available to preview for '{clean_filename}'.")

    # 7. Structured JSON or CSV
    elif ext in (".json", ".csv") or source_type in ("json", "csv"):
        if file_bytes:
            raw_str = file_bytes.decode("utf-8", errors="replace")
            lang = "json" if ext == ".json" or source_type == "json" else "csv"
            markdown_content = f"# {title}\n\n```{lang}\n{raw_str[:20000]}\n```"
            is_converted = True
            converter_used = f"{lang}_formatter"
        elif extracted_text:
            markdown_content = f"# {title}\n\n{extracted_text}"
            is_converted = True
            converter_used = "cached_extracted_text"
        else:
            raise PreviewConversionError(f"No content available to preview for '{clean_filename}'.")

    else:
        # Fallback if extracted_text exists
        if extracted_text:
            markdown_content = f"# {title}\n\n{extracted_text}"
            is_converted = True
            converter_used = "cached_extracted_text"
        else:
            raise PreviewConversionError(
                f"Document format '{ext or source_type}' is not supported for text preview."
            )

    # Sanitize the output to guarantee zero executable scripts, macros, or unsafe HTML
    sanitized_markdown = sanitize_markdown(markdown_content)

    return {
        "source_id": str(source_id),
        "title": title,
        "file_name": clean_filename,
        "format": ext.lstrip(".") or source_type,
        "markdown_content": sanitized_markdown,
        "is_converted": is_converted,
        "converter": converter_used,
        "file_size_bytes": len(file_bytes) if file_bytes else meta.get("file_size_bytes"),
    }
