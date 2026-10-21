"""Tests for Hyades v0.5.1 Latency Benchmark Suite and Reproducible Fixtures.

Validates §6.2 infrastructure requirements:
- Reproducible dataset generator (100 notes, 20 sources, 60 chunks, seed 42)
- Execution of all 10 canonical benchmark operations
- Performance statistics computation (p50, p95, min, max, mean)
"""

import sys
from pathlib import Path

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.content_chunk import ContentChunk
from app.models.note import Note
from app.models.source import Source
from tests.fixtures.v0_5_1_benchmark_data import create_reproducible_benchmark_dataset

# Add project root so scripts can be imported
PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.benchmark_v0_5_1_latency import run_latency_benchmark  # noqa: E402


def test_reproducible_benchmark_dataset_generation():
    """Verify that create_reproducible_benchmark_dataset generates exact required entities."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as db:
        workspace, user, notes, sources = create_reproducible_benchmark_dataset(db)

        assert workspace is not None
        assert user is not None
        assert len(notes) == 100
        assert len(sources) == 20

        # Verify database counts
        total_notes = len(list(db.scalars(select(Note).where(Note.workspace_id == workspace.id))))
        total_sources = len(
            list(db.scalars(select(Source).where(Source.workspace_id == workspace.id)))
        )
        total_chunks = len(
            list(db.scalars(select(ContentChunk).where(ContentChunk.workspace_id == workspace.id)))
        )

        assert total_notes == 100
        assert total_sources == 20
        assert total_chunks == 60  # 3 chunks per source


def test_benchmark_runner_executes_all_operations():
    """Verify that run_latency_benchmark runs successfully and produces valid statistics for all 10 operations."""
    # Run a fast 3-iteration run to verify mechanics and schema interaction
    results = run_latency_benchmark(iterations=3)

    expected_ops = [
        "Note retrieval",
        "Source retrieval",
        "Note search",
        "Source search",
        "Cross-knowledge search",
        "Note summarization",
        "Knowledge answering",
        "Proposal creation",
        "Proposal commit",
        "Execution-status retrieval",
    ]

    for op in expected_ops:
        assert op in results, f"Missing benchmark operation: {op}"
        stat = results[op]
        assert "p50" in stat
        assert "p95" in stat
        assert "min" in stat
        assert "max" in stat
        assert stat["samples"] == 3
        assert stat["p50"] >= 0.0
        assert stat["p95"] >= stat["p50"]
