"""Unit tests for file extractors and validation service per CONTRACT v0.4.2 §11.

Verifies:
- DOCX extractor
- HTML extractor
- EPUB extractor
- JSON extractor with depth limit
- CSV extractor
- Image extractor with raster validation and SVG rejection
- Safe archive limits against zip bombs
- get_extractor resolution factory
"""

import io
import json
import zipfile
import pytest
from PIL import Image

from app.services.extractors import get_extractor
from app.services.extractors.base import safe_open_zip
from app.services.file_validation_service import detect_and_validate_format, resolve_and_verify_storage_path


def test_get_extractor_resolution():
    """Verify get_extractor resolves every contract-required source_type."""
    types = ["pdf", "markdown", "text", "docx", "html", "epub", "json", "csv", "image"]
    for t in types:
        ext = get_extractor(t)
        assert ext is not None

    with pytest.raises(ValueError):
        get_extractor("unsupported_type")


def test_html_extractor_strips_scripts():
    """Verify HTML extractor cleans scripts and extracts title."""
    html_data = b"""
    <!DOCTYPE html>
    <html>
    <head><title>Test Document</title><style>body { color: red; }</style></head>
    <body>
        <h1>Main Header</h1>
        <p>Paragraph content.</p>
        <script>alert("malicious");</script>
    </body>
    </html>
    """
    ext = get_extractor("html")
    res = ext.extract(html_data, "test.html")
    assert "Main Header" in res.text
    assert "Paragraph content." in res.text
    assert "alert" not in res.text
    assert res.metadata["title"] == "Test Document"


def test_json_extractor_and_depth_limit():
    """Verify JSON extractor and depth enforcement."""
    ext = get_extractor("json")

    # Valid JSON
    valid_data = json.dumps({"project": "Hyades", "version": "0.4.2", "features": ["Inbox", "Collections"]}).encode()
    res = ext.extract(valid_data)
    assert "project: Hyades" in res.text
    assert "version: 0.4.2" in res.text

    # Deeply nested JSON exceeding limit
    nested = {"k": "v"}
    for _ in range(25):
        nested = {"level": nested}
    deep_data = json.dumps(nested).encode()

    with pytest.raises(ValueError, match="nesting depth"):
        ext.extract(deep_data)


def test_csv_extractor_table_formatting():
    """Verify CSV extractor formats rows into readable markdown table."""
    csv_data = b"name,role,status\nAlice,Lead,Active\nBob,Dev,Active"
    ext = get_extractor("csv")
    res = ext.extract(csv_data)
    assert "name | role | status" in res.text
    assert "Alice | Lead | Active" in res.text
    assert res.metadata["row_count"] == 3


def test_image_extractor_raster_and_svg_rejection():
    """Verify Image extractor handles raster formats and rejects SVG."""
    # 1. Valid PNG
    img = Image.new("RGB", (100, 50), color="blue")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    png_bytes = buf.getvalue()

    ext = get_extractor("image")
    res = ext.extract(png_bytes, "blue.png")
    assert res.metadata["width"] == 100
    assert res.metadata["height"] == 50
    assert res.metadata["format"] == "png"
    assert res.metadata["mime_type"] == "image/png"

    # 2. Reject SVG
    svg_bytes = b'<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>'
    with pytest.raises(ValueError, match="SVG images are not supported"):
        ext.extract(svg_bytes, "icon.svg")

    # 3. Detect format function rejects SVG
    with pytest.raises(ValueError, match="SVG images are not supported"):
        detect_and_validate_format(svg_bytes, "icon.svg")


def test_safe_open_zip_limits():
    """Verify safe archive limits reject archives with excessive files or size."""
    # Create archive with too many files
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for i in range(10):
            zf.writestr(f"file_{i}.txt", "content")
    data = buf.getvalue()

    # Should pass normal limit
    safe_open_zip(data, max_files=20)

    # Should fail if max_files < 10
    with pytest.raises(ValueError, match="maximum file count"):
        safe_open_zip(data, max_files=5)


def test_storage_path_traversal_prevention(tmp_path):
    """Verify path traversal attempts are detected and rejected."""
    root = str(tmp_path / "sources")
    ws_id = "ws-123"
    src_id = "src-456"

    # Valid
    p = resolve_and_verify_storage_path(root, ws_id, src_id, "document.pdf")
    assert str(p).startswith(root)
    assert p.name == "document.pdf"

    # Traversal attempt in filename
    with pytest.raises(ValueError):
        resolve_and_verify_storage_path(root, ws_id, src_id, "..")


import io
import zipfile
import docx
from app.services.extractors import get_extractor


def test_real_docx_extraction():
    """Verify DOCX extractor extracts real paragraphs and tables."""
    doc = docx.Document()
    doc.add_heading("Architecture Overview", level=1)
    doc.add_paragraph("This is the main introduction to the system.")
    table = doc.add_table(rows=2, cols=2)
    table.cell(0, 0).text = "Service"
    table.cell(0, 1).text = "Role"
    table.cell(1, 0).text = "Backend"
    table.cell(1, 1).text = "FastAPI"

    buf = io.BytesIO()
    doc.save(buf)
    docx_bytes = buf.getvalue()

    ext = get_extractor("docx")
    res = ext.extract(docx_bytes, "arch.docx")
    assert "Architecture Overview" in res.text
    assert "This is the main introduction to the system." in res.text
    assert "Service | Role" in res.text
    assert "Backend | FastAPI" in res.text
    assert res.metadata["paragraph_count"] >= 2
    assert res.metadata["table_count"] == 1


def test_real_epub_extraction():
    """Verify EPUB extractor parses container, OPF manifest, and spine chapters."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("mimetype", "application/epub+zip")
        container_xml = """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
    <rootfiles>
        <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
    </rootfiles>
</container>"""
        zf.writestr("META-INF/container.xml", container_xml)

        content_opf = """<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
    <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>Sample Book</dc:title>
        <dc:creator>Author Name</dc:creator>
    </metadata>
    <manifest>
        <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
        <item id="ch2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
    </manifest>
    <spine>
        <itemref idref="ch1"/>
        <itemref idref="ch2"/>
    </spine>
</package>"""
        zf.writestr("OEBPS/content.opf", content_opf)

        ch1_xhtml = """<!DOCTYPE html><html><body><h1>Chapter One</h1><p>It was a dark and stormy night.</p></body></html>"""
        ch2_xhtml = """<!DOCTYPE html><html><body><h1>Chapter Two</h1><p>The dawn brought new clarity.</p></body></html>"""
        zf.writestr("OEBPS/chapter1.xhtml", ch1_xhtml)
        zf.writestr("OEBPS/chapter2.xhtml", ch2_xhtml)

    epub_bytes = buf.getvalue()
    ext = get_extractor("epub")
    res = ext.extract(epub_bytes, "book.epub")
    assert "Chapter One" in res.text
    assert "It was a dark and stormy night." in res.text
    assert "Chapter Two" in res.text
    assert "The dawn brought new clarity." in res.text
    assert res.metadata["title"] == "Sample Book"
    assert res.metadata["author"] == "Author Name"
    assert res.metadata["chapter_count"] == 2
