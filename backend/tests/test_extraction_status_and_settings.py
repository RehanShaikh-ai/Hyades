"""Unit tests for knowledge extraction status and extract_knowledge settings."""

import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.note import Note
from app.models.source import Source
from app.models.user import User
from app.models.workspace import Workspace


def test_extraction_status_and_toggle_settings(client: TestClient, db_session: Session):
    # 1. Setup workspace & user
    user = User(id=uuid.uuid4(), display_name="Extraction Tester")
    db_session.add(user)
    db_session.commit()

    ws = Workspace(id=uuid.uuid4(), name="Extraction Telemetry WS", owner_id=user.id)
    db_session.add(ws)
    db_session.commit()

    # 2. Create 2 notes: one eligible, one disabled
    note1 = Note(
        id=uuid.uuid4(),
        workspace_id=ws.id,
        created_by=user.id,
        title="Eligible Note",
        content="Testing extraction telemetry content",
        extract_knowledge=True,
    )
    note2 = Note(
        id=uuid.uuid4(),
        workspace_id=ws.id,
        created_by=user.id,
        title="Disabled Note",
        content="This note should not be extracted",
        extract_knowledge=False,
    )
    db_session.add_all([note1, note2])

    # 3. Create 2 sources: one eligible, one disabled
    src1 = Source(
        id=uuid.uuid4(),
        workspace_id=ws.id,
        source_type="markdown",
        original_path="sample.md",
        source_identifier=f"src-{uuid.uuid4().hex[:8]}",
        content_hash="hash1",
        import_batch_id=uuid.uuid4(),
        import_status="completed",
        processing_status="PENDING",
        extract_knowledge=True,
        raw_metadata={"title": "Eligible Source"},
    )
    src2 = Source(
        id=uuid.uuid4(),
        workspace_id=ws.id,
        source_type="pdf",
        original_path="sample.pdf",
        source_identifier=f"src-{uuid.uuid4().hex[:8]}",
        content_hash="hash2",
        import_batch_id=uuid.uuid4(),
        import_status="completed",
        processing_status="FAILED",
        error_message="Corrupted PDF trailer",
        extract_knowledge=True,
        raw_metadata={"title": "Failed Source"},
    )
    db_session.add_all([src1, src2])
    db_session.commit()

    # 4. Check initial extraction status
    res = client.get(f"/api/v1/workspaces/{ws.id}/graph/extraction-status")
    assert res.status_code == 200, res.text
    data = res.json()

    assert data["total_items"] == 4
    # Eligible: note1, src1, src2 = 3 eligible. note2 = 1 ineligible.
    assert data["eligible_count"] == 3
    assert data["ineligible_count"] == 1
    assert data["failed_count"] == 1
    assert "extracted" in data["summary"]

    # 5. Toggle extract_knowledge on note2 via PATCH /notes/{note_id}
    patch_note_res = client.patch(
        f"/api/v1/notes/{note2.id}",
        json={"extract_knowledge": True},
    )
    assert patch_note_res.status_code == 200, patch_note_res.text
    assert patch_note_res.json()["extract_knowledge"] is True

    # 6. Toggle extract_knowledge on src2 via PATCH /sources/{source_id}
    patch_src_res = client.patch(
        f"/api/v1/sources/{src2.id}",
        json={"extract_knowledge": False},
    )
    assert patch_src_res.status_code == 200, patch_src_res.text
    assert patch_src_res.json()["extract_knowledge"] is False

    # 7. Check updated extraction status
    res2 = client.get(f"/api/v1/workspaces/{ws.id}/graph/extraction-status")
    assert res2.status_code == 200
    data2 = res2.json()
    # Now note1, note2, src1 are eligible (3). src2 is ineligible (1).
    assert data2["eligible_count"] == 3
    assert data2["ineligible_count"] == 1
    assert data2["failed_count"] == 0  # src2 was the failed one, now disabled
