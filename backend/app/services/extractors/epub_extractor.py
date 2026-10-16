"""EPUB file extractor.

Canonical module per CONTRACT v0.4.2 §11.4.
Extracts book/chapter text from ZIP-based EPUB archives with strict safety limits.
"""

import os
from typing import Any
import xml.etree.ElementTree as ET

from bs4 import BeautifulSoup
from app.services.extractors.base import BaseExtractor, ExtractedContent, safe_open_zip


class EpubExtractor(BaseExtractor):
    """Extractor for EPUB book archives."""

    def extract(self, file_bytes: bytes, filename: str = "", **kwargs: Any) -> ExtractedContent:
        # Validate ZIP limits first
        zf = safe_open_zip(file_bytes)

        # 1. Locate container.xml
        try:
            container_data = zf.read("META-INF/container.xml")
            container_root = ET.fromstring(container_data)
            # Find rootfile element
            rootfile = container_root.find(".//{urn:oasis:names:tc:opendocument:xmlns:container}rootfile")
            if rootfile is None:
                raise ValueError("EPUB missing rootfile in container.xml")
            opf_path = rootfile.attrib.get("full-path", "")
            if not opf_path:
                raise ValueError("EPUB rootfile has empty full-path")
        except Exception as e:
            raise ValueError(f"Failed to read EPUB container.xml: {e}") from e

        # 2. Read OPF package file
        try:
            opf_data = zf.read(opf_path)
            opf_root = ET.fromstring(opf_data)
            opf_dir = os.path.dirname(opf_path)

            # Extract title & author from metadata
            title_elem = opf_root.find(".//{http://purl.org/dc/elements/1.1/}title")
            title = title_elem.text.strip() if title_elem is not None and title_elem.text else None

            creator_elem = opf_root.find(".//{http://purl.org/dc/elements/1.1/}creator")
            author = creator_elem.text.strip() if creator_elem is not None and creator_elem.text else None

            # Map manifest items by id -> href
            manifest = {}
            for item in opf_root.findall(".//{http://www.idpf.org/2007/opf}item"):
                item_id = item.attrib.get("id")
                item_href = item.attrib.get("href")
                if item_id and item_href:
                    manifest[item_id] = item_href

            # Read spine itemrefs in reading order
            spine_ids = []
            for itemref in opf_root.findall(".//{http://www.idpf.org/2007/opf}itemref"):
                idref = itemref.attrib.get("idref")
                if idref:
                    spine_ids.append(idref)
        except Exception as e:
            raise ValueError(f"Failed to parse EPUB OPF package: {e}") from e

        # 3. Extract text from HTML/XHTML chapters in spine order
        chapters_text = []
        for idref in spine_ids:
            href = manifest.get(idref)
            if not href:
                continue
            chapter_path = os.path.normpath(os.path.join(opf_dir, href)).replace("\\", "/")
            try:
                chapter_bytes = zf.read(chapter_path)
                soup = BeautifulSoup(chapter_bytes, "html.parser")
                for elem in soup(["script", "style", "noscript"]):
                    elem.decompose()
                ctext = soup.get_text(separator="\n", strip=True)
                if ctext:
                    chapters_text.append(ctext)
            except KeyError:
                continue

        full_text = "\n\n---\n\n".join(chapters_text)
        metadata: dict[str, Any] = {
            "format": "epub",
            "title": title,
            "author": author,
            "chapter_count": len(chapters_text),
            "word_count": len(full_text.split()) if full_text else 0,
        }

        return ExtractedContent(text=full_text, metadata=metadata)
