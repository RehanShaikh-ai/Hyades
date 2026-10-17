"""CSV file extractor.

Canonical module per CONTRACT v0.4.2 §11.6.
Converts CSV rows into deterministic textual content.
"""

import csv
import io
from typing import Any

from app.services.extractors.base import BaseExtractor, ExtractedContent


class CsvExtractor(BaseExtractor):
    """Extractor for CSV tabular data."""

    def __init__(self, max_rows: int = 10000):
        self.max_rows = max_rows

    def extract(self, file_bytes: bytes, filename: str = "", **kwargs: Any) -> ExtractedContent:
        try:
            text_str = file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            text_str = file_bytes.decode("latin-1", errors="replace")

        # Detect delimiter if possible
        sample = text_str[:4096]
        delimiter = ","
        try:
            dialect = csv.Sniffer().sniff(sample)
            delimiter = dialect.delimiter
        except Exception:
            delimiter = ","

        reader = csv.reader(io.StringIO(text_str), delimiter=delimiter)
        rows: list[list[str]] = []
        for i, row in enumerate(reader):
            if i >= self.max_rows:
                break
            rows.append(row)

        if not rows:
            return ExtractedContent(
                text="", metadata={"format": "csv", "row_count": 0, "column_count": 0}
            )

        # Format as Markdown table for chunking readability
        header = rows[0]
        col_count = len(header)
        sep = ["---"] * col_count

        lines = [" | ".join(header), " | ".join(sep)]
        for r in rows[1:]:
            # Pad or truncate row to column count
            padded = r[:col_count] + [""] * max(0, col_count - len(r))
            lines.append(" | ".join(padded))

        full_text = "\n".join(lines)
        metadata: dict[str, Any] = {
            "format": "csv",
            "row_count": len(rows),
            "column_count": col_count,
            "delimiter": delimiter,
            "word_count": len(full_text.split()),
        }

        return ExtractedContent(text=full_text, metadata=metadata)
