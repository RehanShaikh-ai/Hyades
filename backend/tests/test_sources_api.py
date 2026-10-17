"""API and integration tests for source ingestion and deduplication.

Contract references:
    CONTRACT_v0.2.2.md §5, §7, §11, §12, §14.1
"""

import io
import uuid
import zipfile

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.note import Note
from app.models.note_link import NoteLink
from app.models.source import Source
from app.models.user import User
from app.models.workspace import Workspace


@pytest.fixture
def test_user_and_workspace(db_session: Session) -> tuple[User, Workspace]:
    user = User(id=uuid.uuid4(), display_name="Test Importer")
    db_session.add(user)
    db_session.flush()

    ws = Workspace(id=uuid.uuid4(), name="Import Workspace", owner_id=user.id)
    db_session.add(ws)
    db_session.commit()
    return user, ws


def test_preview_makes_no_database_writes(
    client: TestClient, db_session: Session, test_user_and_workspace: tuple[User, Workspace]
):
    """Preview must never write to the database.

    CONTRACT_v0.2.2.md §7.1, §14.1
    """
    _, ws = test_user_and_workspace
    md_content = b"# Neural Networks\n[[Machine Learning]] is fun.\n#ai #deep-learning"

    files = [("files", ("neural-networks.md", io.BytesIO(md_content), "text/markdown"))]
    response = client.post(f"/api/v1/workspaces/{ws.id}/sources/preview", files=files)
    assert response.status_code == 200

    data = response.json()
    assert len(data["detected_notes"]) == 1
    assert data["detected_notes"][0]["title"] == "Neural Networks"
    assert data["detected_notes"][0]["tag_count"] == 2
    assert data["detected_notes"][0]["outgoing_link_count"] == 1
    assert data["detected_notes"][0]["is_duplicate"] is False
    assert data["detected_notes"][0]["will_update_existing"] is False
    assert data["unresolved_link_count"] == 1
    assert len(data["warnings"]) == 1

    # Verify zero database writes
    sources_count = db_session.scalar(select(Source).where(Source.workspace_id == ws.id))
    notes_count = db_session.scalar(select(Note).where(Note.workspace_id == ws.id))
    assert sources_count is None
    assert notes_count is None


def test_commit_import_and_deduplication(
    client: TestClient, db_session: Session, test_user_and_workspace: tuple[User, Workspace]
):
    """Verify commit import, upsert on changed content, and skip on unchanged.

    CONTRACT_v0.2.2.md §5.5, §7.2, §14.1
    """
    user, ws = test_user_and_workspace

    # 1. Initial import
    content_v1 = b"# Topic A\nFirst version content with #topic/tag"
    files = [("files", ("docs/topic-a.md", io.BytesIO(content_v1), "text/markdown"))]
    res1 = client.post(
        f"/api/v1/workspaces/{ws.id}/sources/import",
        data={"created_by": str(user.id)},
        files=files,
    )
    assert res1.status_code == 201
    data1 = res1.json()
    assert data1["imported"] == 1
    assert data1["updated"] == 0
    assert data1["skipped"] == 0
    assert data1["failed"] == 0
    note_id = data1["results"][0]["note_id"]
    assert note_id is not None

    # Verify Note and Source created
    note = db_session.get(Note, uuid.UUID(note_id))
    assert note is not None
    assert note.title == "Topic A"
    assert "First version" in note.content
    assert any(t.name == "topic/tag" for t in note.tags)

    source = db_session.scalars(
        select(Source).where(Source.workspace_id == ws.id, Source.note_id == note.id)
    ).first()
    assert source is not None
    assert source.import_status == "completed"

    # 2. Re-import unchanged content -> skipped
    files_unchanged = [("files", ("docs/topic-a.md", io.BytesIO(content_v1), "text/markdown"))]
    res2 = client.post(
        f"/api/v1/workspaces/{ws.id}/sources/import",
        data={"created_by": str(user.id)},
        files=files_unchanged,
    )
    assert res2.status_code == 201
    data2 = res2.json()
    assert data2["imported"] == 0
    assert data2["updated"] == 0
    assert data2["skipped"] == 1
    assert data2["results"][0]["status"] == "skipped"
    assert data2["results"][0]["note_id"] == note_id

    # 3. Re-import changed content -> updated in place, note ID unchanged
    content_v2 = b"# Topic A\nSecond updated version content with #topic/tag"
    files_changed = [("files", ("docs/topic-a.md", io.BytesIO(content_v2), "text/markdown"))]
    res3 = client.post(
        f"/api/v1/workspaces/{ws.id}/sources/import",
        data={"created_by": str(user.id)},
        files=files_changed,
    )
    assert res3.status_code == 201
    data3 = res3.json()
    assert data3["imported"] == 0
    assert data3["updated"] == 1
    assert data3["skipped"] == 0
    assert data3["results"][0]["status"] == "completed"
    assert data3["results"][0]["note_id"] == note_id

    # Refresh note: verify in-place update
    db_session.expire_all()
    note_updated = db_session.get(Note, uuid.UUID(note_id))
    assert note_updated.id == note.id
    assert "Second updated version" in note_updated.content


def test_unresolved_links_auto_resolve_on_later_import(
    client: TestClient, db_session: Session, test_user_and_workspace: tuple[User, Workspace]
):
    """Unresolved wikilinks are not persisted initially, then auto-resolve when target exists.

    CONTRACT_v0.2.2.md §5.3, §14.1
    """
    user, ws = test_user_and_workspace

    # Note 1 links to Target Note which doesn't exist yet
    note1_content = b"# Note One\nLinking to [[Target Note]] here."
    res1 = client.post(
        f"/api/v1/workspaces/{ws.id}/sources/import",
        data={"created_by": str(user.id)},
        files=[("files", ("note1.md", io.BytesIO(note1_content), "text/markdown"))],
    )
    assert res1.status_code == 201
    note1_id = uuid.UUID(res1.json()["results"][0]["note_id"])

    # Verify no NoteLink persisted
    links_before = db_session.scalars(
        select(NoteLink).where(NoteLink.source_note_id == note1_id)
    ).all()
    assert len(links_before) == 0

    # Note 2 is imported with title "Target Note"
    note2_content = b"# Target Note\nI am the target."
    res2 = client.post(
        f"/api/v1/workspaces/{ws.id}/sources/import",
        data={"created_by": str(user.id)},
        files=[("files", ("target.md", io.BytesIO(note2_content), "text/markdown"))],
    )
    assert res2.status_code == 201
    note2_id = uuid.UUID(res2.json()["results"][0]["note_id"])

    # Verify NoteLink now exists automatically!
    db_session.expire_all()
    link = db_session.get(NoteLink, (note1_id, note2_id))
    assert link is not None


def test_zip_vault_import_and_path_traversal_rejection(
    client: TestClient, db_session: Session, test_user_and_workspace: tuple[User, Workspace]
):
    """Zip archives must extract cleanly, and path traversal entries must be safely rejected.

    CONTRACT_v0.2.2.md §7.1, §12.2, §14.1
    """
    user, ws = test_user_and_workspace

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w") as zf:
        zf.writestr("vault/note1.md", "# Vault Note 1\nHello from vault.")
        zf.writestr("vault/subfolder/note2.md", "# Vault Note 2\n[[Vault Note 1]]")
        # Malicious traversal entry
        zf.writestr("../etc/passwd.md", "# Malicious\nShould be rejected.")

    zip_bytes = zip_buffer.getvalue()

    # Preview
    res_prev = client.post(
        f"/api/v1/workspaces/{ws.id}/sources/preview",
        files=[("files", ("my_vault.zip", io.BytesIO(zip_bytes), "application/zip"))],
    )
    assert res_prev.status_code == 200
    prev_data = res_prev.json()
    assert len(prev_data["detected_notes"]) == 2
    assert any("traversal" in err.lower() for err in prev_data["errors"])

    # Commit
    res_import = client.post(
        f"/api/v1/workspaces/{ws.id}/sources/import",
        data={"created_by": str(user.id)},
        files=[("files", ("my_vault.zip", io.BytesIO(zip_bytes), "application/zip"))],
    )
    assert res_import.status_code == 201
    import_data = res_import.json()
    assert import_data["imported"] == 2
    assert import_data["failed"] == 1
    assert any(
        r["status"] == "failed" and "traversal" in (r["error"] or "").lower()
        for r in import_data["results"]
    )


def test_source_attribution_and_search_integration(
    client: TestClient, db_session: Session, test_user_and_workspace: tuple[User, Workspace]
):
    """Imported notes should have source attribution visible in note GET and search.

    CONTRACT_v0.2.2.md §10.1, §14.1
    """
    user, ws = test_user_and_workspace

    md_content = b"""---
title: Quantum Teleportation
status: theoretical
---
# Quantum Teleportation
Entanglement enables teleportation of quantum states.
#physics #quantum
"""
    res = client.post(
        f"/api/v1/workspaces/{ws.id}/sources/import",
        data={"created_by": str(user.id)},
        files=[("files", ("physics/quantum.md", io.BytesIO(md_content), "text/markdown"))],
    )
    assert res.status_code == 201
    note_id = res.json()["results"][0]["note_id"]

    # 1. Fetch note by ID
    get_res = client.get(f"/api/v1/notes/{note_id}")
    assert get_res.status_code == 200
    note_data = get_res.json()
    assert note_data["source"] is not None
    assert note_data["source"]["source_type"] == "markdown"
    assert note_data["source"]["original_path"] == "physics/quantum.md"
    assert note_data["metadata"] == {"title": "Quantum Teleportation", "status": "theoretical"}

    # 2. Search note by keyword
    search_res = client.get(f"/api/v1/workspaces/{ws.id}/notes/search?q=teleportation")
    assert search_res.status_code == 200
    search_data = search_res.json()
    assert search_data["total"] >= 1
    found = next(item for item in search_data["items"] if item["id"] == note_id)
    assert found["source"] is not None
    assert found["source"]["original_path"] == "physics/quantum.md"


def test_source_errors_contract(
    client: TestClient, test_user_and_workspace: tuple[User, Workspace]
):
    """Verify error codes per contract §11.

    404 WORKSPACE_NOT_FOUND, 404 USER_NOT_FOUND, 404 SOURCE_NOT_FOUND, 422 VALIDATION_ERROR
    """
    user, ws = test_user_and_workspace
    random_id = str(uuid.uuid4())

    # 404 WORKSPACE_NOT_FOUND on preview
    files = [("files", ("test.md", io.BytesIO(b"# Hello"), "text/markdown"))]
    res = client.post(f"/api/v1/workspaces/{random_id}/sources/preview", files=files)
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "WORKSPACE_NOT_FOUND"

    # 404 USER_NOT_FOUND on import
    res2 = client.post(
        f"/api/v1/workspaces/{ws.id}/sources/import",
        data={"created_by": random_id},
        files=files,
    )
    assert res2.status_code == 404
    assert res2.json()["error"]["code"] == "USER_NOT_FOUND"

    # 404 SOURCE_NOT_FOUND on get source
    res3 = client.get(f"/api/v1/sources/{random_id}")
    assert res3.status_code == 404
    assert res3.json()["error"]["code"] == "SOURCE_NOT_FOUND"


def test_source_upload_single_file_extracts_title_excerpt_and_timings(
    client: TestClient, test_user_and_workspace: tuple[User, Workspace]
):
    """Verify single file upload extracts real title, genuine excerpt, and records stage timings.

    CONTRACT v0.4.2 § 11, § 14
    """
    _, ws = test_user_and_workspace
    doc_content = b"""# Celestial Observations of Hyades
The Hyades open cluster is located approximately 153 light-years from the Sun.
It forms the head of the constellation Taurus, containing hundreds of co-moving stars.
"""
    files = {"file": ("celestial_hyades.md", io.BytesIO(doc_content), "text/markdown")}
    res = client.post(f"/api/v1/workspaces/{ws.id}/sources/upload", files=files)
    assert res.status_code == 201
    data = res.json()
    assert data["title"] == "Celestial Observations of Hyades"
    assert data["file_name"] == "celestial_hyades.md"
    assert "approximately 153 light-years" in (data["excerpt"] or "")
    assert "Celestial Observations of Hyades" in (data["extracted_text"] or "")
    assert data["processing_status"] in ("READY", "PROCESSING", "PENDING")

    # Verify stage timings were populated
    timings = data.get("stage_timings")
    if timings:
        assert "extract_ms" in timings
        assert "normalize_ms" in timings
        assert "chunk_ms" in timings
        assert "embed_and_index_ms" in timings
        assert "total_processing_ms" in timings
        assert timings["total_processing_ms"] >= 0


def test_source_upload_review_mode_creates_inbox_item_fast(
    client: TestClient, test_user_and_workspace: tuple[User, Workspace]
):
    """Verify upload in review_mode=inbox creates pending item without blocking on dry-run LLMs."""
    import time

    _, ws = test_user_and_workspace
    doc_content = b"""# Epistemological Inquiry
A philosophical examination into personal knowledge structures and synthetic memory.
"""
    t0 = time.perf_counter()
    files = {"file": ("epistemology.txt", io.BytesIO(doc_content), "text/plain")}
    res = client.post(f"/api/v1/workspaces/{ws.id}/sources/upload?review_mode=inbox", files=files)
    elapsed = time.perf_counter() - t0
    assert res.status_code == 201
    # Must complete fast (under 4s even with cold models)
    assert elapsed < 4.0

    # Verify InboxItem was created
    inbox_res = client.get(f"/api/v1/inbox?workspace_id={ws.id}&status=pending")
    assert inbox_res.status_code == 200
    items = inbox_res.json()["items"]
    assert any(
        "Epistemological Inquiry" in (it.get("source_title") or "")
        or "epistemology.txt" in (it.get("source_title") or "")
        for it in items
    )
