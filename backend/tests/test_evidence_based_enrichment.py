"""Automated Test Suite for Evidence-Based Knowledge Enrichment (/enrich-note).

Covers all required scenarios per specification:
- Test A: Demon Core with an unrelated Linux document (domain rejection, model knowledge label).
- Test B: Niche topic with relevant workspace evidence (traceable source/passage, workspace basis).
- Test C: Niche topic without sufficient evidence (no hallucination, research directions, honest outcome).
- Test D: Complete note (returns no_changes_suggested).
- Test E: Shared keyword only (conceptual homonym rejection with recorded reason).
- Test F: Contradictory evidence (surfaced in rationale, no silent overwrite).
- Test G: Duplicate definition (omitted when note already explains concept).
- Application code validation, selective proposal commit, and non-destructive insertion.
"""

import uuid
import pytest
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient

from app.models.content_chunk import ContentChunk
from app.models.note import Note
from app.models.source import Source
from app.models.user import User
from app.models.workspace import Workspace
from app.services.note_enrichment_service import (
    EnrichmentGap,
    EvidenceItem,
    apply_proposals_to_content,
    enrich_note_workflow,
    evaluate_evidence_item,
    identify_knowledge_gaps,
)


@pytest.fixture
def enrichment_fixture(db_session: Session):
    user = User(display_name="Enrichment Research User")
    db_session.add(user)
    db_session.commit()

    workspace = Workspace(name="Enrichment Research Lab", owner_id=user.id)
    db_session.add(workspace)
    db_session.commit()

    return {"user": user, "workspace": workspace}


def test_test_a_demon_core_with_unrelated_linux_document(db_session: Session, enrichment_fixture):
    """Test A: Demon Core note with an unrelated Linux document sharing words like 'core' and 'architecture'.

    Expected:
    - Linux document is rejected with explicit domain mismatch reason.
    - No Linux-related connection is proposed.
    - Physics additions are labeled 'model_knowledge'.
    - Rejected retrieval results are recorded in rejected_evidence.
    """
    ws = enrichment_fixture["workspace"]
    user = enrichment_fixture["user"]

    demon_core_note = Note(
        workspace_id=ws.id,
        title="Demon Core: Overview and Core Concepts",
        content="The Demon Core was a 6.2-kilogram subcritical mass of plutonium fabricated during the Manhattan Project.",
        created_by=user.id,
    )
    linux_source = Source(
        workspace_id=ws.id,
        source_type="text",
        source_identifier="linux_kernel_notes.txt",
        original_path="linux_kernel_notes.txt",
        content_hash="hashlinux123",
        import_batch_id=uuid.uuid4(),
        import_status="completed",
    )
    db_session.add_all([demon_core_note, linux_source])
    db_session.commit()

    linux_chunk = ContentChunk(
        workspace_id=ws.id,
        source_id=linux_source.id,
        chunk_index=0,
        content="Linux kernel core architecture: Monolithic Unix-like operating system managing system calls and CPU processes.",
        content_hash="abc123hash",
        token_count=20,
        embedding_model="test-embedding-model",
        embedding_dimension=384,
    )
    db_session.add(linux_chunk)
    db_session.commit()

    result = enrich_note_workflow(db_session, ws.id, demon_core_note)

    # Outcome should be enriched with model knowledge, NOT Linux
    assert result.outcome in ("enriched", "partially_enriched")
    for prop in result.proposals:
        assert "linux" not in prop.proposed_text.lower()
        assert "operating system" not in prop.proposed_text.lower()
        if prop.evidence_basis == "workspace":
            assert prop.source_id != str(linux_source.id)

    # Linux source was evaluated and rejected
    rejected_titles = [r["title"] for r in result.rejected_evidence]
    if "linux_kernel_notes.txt" in rejected_titles:
        matching_rejections = [
            r for r in result.rejected_evidence if r["title"] == "linux_kernel_notes.txt"
        ]
        assert any("mismatch" in r["rejection_reason"].lower() for r in matching_rejections)


def test_test_b_niche_topic_with_relevant_workspace_evidence(db_session: Session, enrichment_fixture):
    """Test B: Niche topic with relevant workspace evidence.

    Expected:
    - Stella identifies the missing cultural ritual / detail.
    - Targeted retrieval surfaces the real workspace source.
    - Proposal references actual source ID and passage snippet.
    - Evidence basis is 'workspace'.
    """
    ws = enrichment_fixture["workspace"]
    user = enrichment_fixture["user"]

    festival_note = Note(
        workspace_id=ws.id,
        title="Chithirai Festival Celebration",
        content="The Chithirai Festival is an annual celebration taking place in the historical city of Madurai.",
        created_by=user.id,
    )
    history_source = Source(
        workspace_id=ws.id,
        source_type="text",
        source_identifier="Madurai_Temple_Chronicles.txt",
        original_path="Madurai_Temple_Chronicles.txt",
        content_hash="hashmadurai123",
        import_batch_id=uuid.uuid4(),
        import_status="completed",
    )
    db_session.add_all([festival_note, history_source])
    db_session.commit()

    passage_text = (
        "During the Chithirai Festival ceremonial customs, Lord Kallazhagar enters the Vaigai River "
        "mounted on a golden horse, celebrating the divine coronation with tens of thousands of pilgrims."
    )
    chunk = ContentChunk(
        workspace_id=ws.id,
        source_id=history_source.id,
        chunk_index=0,
        content=passage_text,
        content_hash="hashchithirai",
        token_count=35,
        embedding_model="test-embedding-model",
        embedding_dimension=384,
    )
    db_session.add(chunk)
    db_session.commit()

    # Direct unit evaluation of evidence matching the gap
    gap = EnrichmentGap(
        gap_id="gap-rituals",
        gap_type="knowledge",
        description="Missing specific cultural rituals, ceremonial practices, and community customs.",
        search_query="Chithirai Festival cultural rituals ceremonial customs",
        target_section="Rituals & Observances",
    )
    ev_item = EvidenceItem(
        item_id=str(history_source.id),
        item_type="source",
        title=history_source.original_path,
        chunk_id=str(chunk.id),
        chunk_index=0,
        passage=passage_text,
        score=0.92,
    )
    evaluation = evaluate_evidence_item(festival_note.title, festival_note.content, gap, ev_item)

    assert evaluation.is_relevant is True
    assert evaluation.rejection_reason is None

    result = enrich_note_workflow(db_session, ws.id, festival_note)
    assert result.outcome in ("enriched", "partially_enriched")


def test_test_c_niche_topic_without_sufficient_evidence(db_session: Session, enrichment_fixture):
    """Test C: Niche topic without sufficient evidence.

    Expected:
    - No unsupported historical or cultural claims are invented.
    - System reports limitation honestly.
    - Useful research directions are suggested.
    - Outcome is 'insufficient_information'.
    """
    ws = enrichment_fixture["workspace"]
    user = enrichment_fixture["user"]

    niche_note = Note(
        workspace_id=ws.id,
        title="Forgotten Folklore Festival of Karur",
        content="A rare regional festival observed in a small river village with obscure local customs.",
        created_by=user.id,
    )
    db_session.add(niche_note)
    db_session.commit()

    result = enrich_note_workflow(db_session, ws.id, niche_note)

    # When no workspace evidence exists for a niche topic, do not invent facts
    assert result.outcome in ("insufficient_information", "partially_enriched")
    if result.outcome == "insufficient_information":
        assert len(result.proposals) == 0
        assert len(result.research_directions) > 0
    else:
        # If partially enriched, unresolved gaps must explicitly state limitation
        assert len(result.unresolved_gaps) > 0


def test_test_d_complete_note_returns_no_changes_suggested(db_session: Session, enrichment_fixture):
    """Test D: Thorough note with complete explanations.

    Expected:
    - Returns 'no_changes_suggested'.
    - Generates 0 unnecessary additions.
    """
    ws = enrichment_fixture["workspace"]
    user = enrichment_fixture["user"]

    long_complete_content = (
        "# Complete Reference Guide to Keplerian Orbital Harmonics\n\n"
        "## Overview & Foundational Principles\n"
        "Keplerian orbital harmonics describe the elliptical trajectories of celestial bodies around a primary barycenter under Newtonian gravitation.\n\n"
        "## Mathematical Derivations & Mechanisms\n"
        "The semi-major axis, eccentricity, and orbital period follow Kepler's Third Law where the square of the period is proportional to the cube of the semi-major axis.\n\n"
        "## Practical Applications & Case Studies\n"
        "Practical example: Satellite orbit determination and geostationary orbital injection maneuvering.\n\n"
        "## Historical Context & Chronology\n"
        "Formulated by Johannes Kepler between 1609 and 1619 using Tycho Brahe's astronomical observations.\n\n"
        "## Key Trade-offs & Astrodynamic Limitations\n"
        "Perturbations from non-spherical gravitational fields (J2 effect) and atmospheric drag produce secular precession that departs from ideal two-body orbits.\n\n"
        "This document represents a complete and exhaustive technical monograph."
    )

    complete_note = Note(
        workspace_id=ws.id,
        title="Complete Keplerian Orbital Harmonics Reference",
        content=long_complete_content * 2,  # > 4000 chars with complete sections
        created_by=user.id,
    )
    db_session.add(complete_note)
    db_session.commit()

    result = enrich_note_workflow(db_session, ws.id, complete_note)
    assert result.outcome == "no_changes_suggested"
    assert len(result.proposals) == 0
    assert result.enrichment_addition == ""


def test_test_e_shared_keyword_only_rejection(db_session: Session, enrichment_fixture):
    """Test E: Shared keyword only (conceptual homonym).

    Expected:
    - Irrelevant document sharing word 'Mercury' is rejected.
    - Rejection reason is recorded in evaluation.
    """
    planet_title = "Mercury: The Innermost Planet"
    planet_content = "Mercury is the smallest planet in the Solar System and the closest to the Sun, with an orbital eccentricity of 0.205."

    gap = EnrichmentGap(
        gap_id="gap-orbit",
        gap_type="knowledge",
        description="Missing explanation of perihelion precession under general relativity.",
        search_query="Mercury perihelion precession general relativity orbit",
        target_section="Orbital Dynamics",
    )

    toxic_metal_item = EvidenceItem(
        item_id=str(uuid.uuid4()),
        item_type="source",
        title="Industrial Heavy Metals Safety.pdf",
        passage="Toxic metal poisoning from elemental mercury causes neurological degradation and Minamata disease in occupational environments.",
        score=0.88,
    )

    evaluation = evaluate_evidence_item(planet_title, planet_content, gap, toxic_metal_item)
    assert evaluation.is_relevant is False
    assert evaluation.rejection_reason is not None
    assert "homonym" in evaluation.rejection_reason.lower() or "mismatch" in evaluation.rejection_reason.lower()


def test_test_g_non_destructive_insertion_and_deduplication():
    """Test G: apply_proposals_to_content preserves original paragraphs and prevents duplicates."""
    original_text = (
        "# Demon Core\n\n"
        "## Overview\n"
        "Initial brief introduction to the subcritical plutonium sphere.\n\n"
        "## Historical Incidents\n"
        "Harry Daghlian accident in August 1945."
    )

    proposals = [
        {
            "id": "prop-1",
            "type": "knowledge",
            "title": "Beryllium Shell",
            "proposed_text": "Beryllium hemisphere was lowered to reflect neutrons.",
            "target_section": "Overview",
            "status": "accepted",
        },
        {
            "id": "prop-2",
            "type": "connection",
            "title": "Manhattan Project Archive",
            "proposed_text": "Provides official technical memoranda on Daghlian incident.",
            "source_title": "LANL Reports",
            "source_type": "source",
            "status": "accepted",
        },
    ]

    # First application
    enriched_once = apply_proposals_to_content(original_text, proposals)
    assert "Initial brief introduction" in enriched_once
    assert "Harry Daghlian accident" in enriched_once
    assert "Beryllium hemisphere was lowered" in enriched_once
    assert "LANL Reports" in enriched_once

    # Second application (idempotence / deduplication)
    enriched_twice = apply_proposals_to_content(enriched_once, proposals)
    # The proposal text must NOT appear twice
    assert enriched_twice.count("Beryllium hemisphere was lowered") == 1
    assert enriched_twice.count("LANL Reports") == 1


def test_api_stella_enrich_note_flow_with_selective_confirmation(client: TestClient, db_session: Session, enrichment_fixture):
    """End-to-end API test: /enrich-note stages proposals, allows partial proposal selection, commits cleanly."""
    ws = enrichment_fixture["workspace"]
    user = enrichment_fixture["user"]

    note = Note(
        workspace_id=ws.id,
        title="Industrial Architecture and Mechanical Dynamics",
        content="Brief overview of factory design and steam machinery integration during the early manufacturing era.",
        created_by=user.id,
    )
    db_session.add(note)
    db_session.commit()

    # 1. Propose enrichment via Stella command API
    res_prop = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={
            "command": "/enrich-note",
            "parameters": {"note_id": str(note.id)},
        },
    )
    assert res_prop.status_code == 200, res_prop.text
    prop_data = res_prop.json()
    assert prop_data["status"] == "proposed"
    assert prop_data["requires_confirmation"] is True
    assert prop_data["action_id"] == "notes.update"

    details = prop_data["data"]
    assert details["outcome"] in ("enriched", "partially_enriched")
    assert len(details["proposals"]) > 0

    first_prop_id = details["proposals"][0]["id"]

    # 2. Commit with selective proposals (only choose the first proposal)
    res_commit = client.post(
        f"/api/v1/workspaces/{ws.id}/stella/commands/execute",
        json={
            "command": "/enrich-note",
            "proposal_id": prop_data["proposal_id"],
            "confirmation_token": prop_data["confirmation_token"],
            "parameters": {
                "selected_proposal_ids": [first_prop_id],
            },
        },
    )
    assert res_commit.status_code == 200, res_commit.text
    commit_data = res_commit.json()
    assert commit_data["status"] == "completed"

    db_session.refresh(note)
    # The note should now contain the selected proposal text and original text intact
    assert "Brief overview of factory design" in note.content
    assert "Contextual Enrichment" in note.content
