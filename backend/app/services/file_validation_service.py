"""File validation and path security service.

Canonical module per CONTRACT v0.4.2 §8.6, §11.7, §17, §18.1.
Enforces magic bytes verification, SVG rejection, and storage path traversal prevention.
"""

import os
from pathlib import Path
from typing import Any

SUPPORTED_SOURCE_TYPES = {
    "pdf",
    "markdown",
    "text",
    "docx",
    "html",
    "epub",
    "json",
    "csv",
    "image",
}

EXTENSION_TO_SOURCE_TYPE = {
    ".pdf": "pdf",
    ".md": "markdown",
    ".markdown": "markdown",
    ".txt": "text",
    ".text": "text",
    ".docx": "docx",
    ".html": "html",
    ".htm": "html",
    ".epub": "epub",
    ".json": "json",
    ".csv": "csv",
    ".jpg": "image",
    ".jpeg": "image",
    ".png": "image",
    ".webp": "image",
    ".gif": "image",
}


def detect_and_validate_format(file_bytes: bytes, filename: str) -> tuple[str, str | None]:
    """Validate file content and extension, returning (source_type, mime_type).

    Contract §8.6: Supported formats are markdown | txt | pdf | docx | html | epub | json | csv | image.
    Contract §11.7: SVG is explicitly rejected.
    """
    ext = os.path.splitext(filename)[1].lower() if filename else ""

    # 1. Explicit SVG rejection
    if ext == ".svg":
        raise ValueError("SVG images are not supported. Only raster images are accepted.")
    sample = file_bytes[:1024].lower()
    if b"<svg" in sample or (b"<?xml" in sample and b"svg" in sample):
        raise ValueError("SVG images are not supported. Only raster images are accepted.")

    # 2. Magic byte checks
    if file_bytes.startswith(b"%PDF"):
        return "pdf", "application/pdf"
    elif file_bytes.startswith(b"PK\x03\x04"):
        # Could be docx or epub
        if ext == ".epub" or b"mimetypeapplication/epub+zip" in file_bytes[:100]:
            return "epub", "application/epub+zip"
        elif ext == ".docx":
            return "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        elif ext in EXTENSION_TO_SOURCE_TYPE:
            return EXTENSION_TO_SOURCE_TYPE[ext], None
    elif file_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image", "image/png"
    elif file_bytes.startswith(b"\xff\xd8\xff"):
        return "image", "image/jpeg"
    elif file_bytes.startswith(b"RIFF") and b"WEBP" in file_bytes[:16]:
        return "image", "image/webp"
    elif file_bytes.startswith(b"GIF87a") or file_bytes.startswith(b"GIF89a"):
        return "image", "image/gif"

    # 3. Extension fallback if valid text format
    if ext in EXTENSION_TO_SOURCE_TYPE:
        st = EXTENSION_TO_SOURCE_TYPE[ext]
        mime_map = {
            "html": "text/html",
            "json": "application/json",
            "csv": "text/csv",
            "markdown": "text/markdown",
            "text": "text/plain",
        }
        return st, mime_map.get(st, "application/octet-stream")

    raise ValueError(
        f"Unsupported file format for '{filename}'. Allowed formats: {', '.join(sorted(SUPPORTED_SOURCE_TYPES))}"
    )


def resolve_and_verify_storage_path(
    storage_root: str,
    workspace_id: Any,
    source_id: Any,
    filename: str,
) -> Path:
    """Resolve and verify storage path preventing directory traversal.

    Contract §1.1, §17:
    Directory structure: ${SOURCE_STORAGE_ROOT}/{workspace_id}/{source_id}/{original_filename}
    Path traversal attempts (e.g. '../') are rejected.
    """
    # Sanitize filename
    clean_filename = os.path.basename(filename)
    if not clean_filename or clean_filename in (".", ".."):
        raise ValueError("Invalid file name")

    root_path = Path(storage_root).resolve()
    target_dir = (root_path / str(workspace_id) / str(source_id)).resolve()
    target_file = (target_dir / clean_filename).resolve()

    # Verify that target_file is strictly inside root_path
    try:
        target_file.relative_to(root_path)
    except ValueError as e:
        raise ValueError(
            f"Path traversal detected: path {target_file} is outside storage root {root_path}"
        ) from e

    return target_file
