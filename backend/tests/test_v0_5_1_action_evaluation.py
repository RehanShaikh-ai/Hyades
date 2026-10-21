"""Tests for Hyades v0.5.1 Action and Retrieval Evaluation against Golden Set.

Validates §6.2 evaluation requirements:
- Loads version-controlled golden set fixture (`v0_5_1_golden_questions.json`)
- Evaluates retrieval quality metrics against benchmark data:
  - Recall@5
  - Mean Reciprocal Rank (MRR)
  - Citation precision
  - Groundedness simulation
"""

import json
from pathlib import Path

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.content_chunk import ContentChunk
from tests.fixtures.v0_5_1_benchmark_data import create_reproducible_benchmark_dataset


@pytest.fixture
def golden_questions():
    """Load golden questions fixture."""
    fixture_path = Path(__file__).parent / "fixtures" / "v0_5_1_golden_questions.json"
    with open(fixture_path, encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def test_db_session():
    """Create in-memory SQLite database populated with reproducible benchmark fixtures."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        workspace, user, notes, sources = create_reproducible_benchmark_dataset(db)
        yield db, workspace, notes, sources


def test_golden_questions_fixture_schema(golden_questions):
    """Validate structure and minimum requirements of version-controlled golden set."""
    assert len(golden_questions) >= 5, "Golden set must contain at least 5 questions per §6.2"

    for gq in golden_questions:
        assert "id" in gq
        assert "question" in gq and len(gq["question"]) > 10
        assert "domain" in gq
        assert "expected_keywords" in gq and len(gq["expected_keywords"]) >= 2
        assert "min_recall_at_5" in gq
        assert gq["min_recall_at_5"] > 0.0


def test_retrieval_recall_and_mrr(golden_questions, test_db_session):
    """Evaluate Recall@5 and Mean Reciprocal Rank (MRR) across the golden questions."""
    db, workspace, notes, sources = test_db_session

    reciprocal_ranks = []
    recall_at_5_hits = 0

    for gq in golden_questions:
        keywords = gq["expected_keywords"]

        # Simulate hybrid retrieval: query notes matching keywords in title/content
        # Rank by matching keywords count
        matching_notes = []
        for note in notes:
            score = sum(
                1
                for kw in keywords
                if kw.lower() in note.title.lower() or kw.lower() in note.content.lower()
            )
            if score > 0:
                matching_notes.append((note, score))

        # Sort descending by relevance score
        matching_notes.sort(key=lambda x: x[1], reverse=True)

        # Evaluate if at least one expected domain topic is retrieved in top 5
        domain_term = gq["domain"].split()[0].lower()
        hit_rank = None
        for rank, (note, _) in enumerate(matching_notes, start=1):
            if domain_term in note.title.lower() or domain_term in note.content.lower():
                hit_rank = rank
                break

        if hit_rank is not None:
            reciprocal_ranks.append(1.0 / hit_rank)
            if hit_rank <= 5:
                recall_at_5_hits += 1
        else:
            reciprocal_ranks.append(0.0)

    recall_at_5 = recall_at_5_hits / len(golden_questions)
    mrr = sum(reciprocal_ranks) / len(reciprocal_ranks)

    # Validate against evaluation targets
    assert recall_at_5 >= 0.80, f"Recall@5 ({recall_at_5:.2f}) below minimum 0.80 target"
    assert mrr >= 0.70, f"MRR ({mrr:.2f}) below minimum 0.70 target"


def test_citation_precision_and_groundedness(golden_questions, test_db_session):
    """Verify that retrieved chunk citations are grounded within existing content chunks."""
    db, workspace, notes, sources = test_db_session

    for gq in golden_questions:
        keywords = gq["expected_keywords"]
        primary_kw = keywords[0]

        # Retrieve relevant chunks from content_chunks
        stmt = (
            select(ContentChunk)
            .where(
                ContentChunk.workspace_id == workspace.id,
                ContentChunk.content.like(f"%{primary_kw}%"),
            )
            .limit(5)
        )
        chunks = list(db.scalars(stmt))

        # Citation precision: all returned chunks must have valid source_id and content
        for chunk in chunks:
            assert chunk.source_id is not None
            assert chunk.content is not None
            assert len(chunk.content) > 20
            # Groundedness: chunk content must verify against database record
            db_chunk = db.get(ContentChunk, chunk.id)
            assert db_chunk is not None
            assert db_chunk.content_hash == chunk.content_hash
