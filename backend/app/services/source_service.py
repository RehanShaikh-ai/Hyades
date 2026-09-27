"""Source ingestion and deduplication service.

Canonical service per CONTRACT §4.3, §5, §7, §12 (v0.2.2) and
CONTRACT v0.4.1 §4.3, §6.1, §6.6, §7.1-§7.4, §10.1.
Provides upload_source, get_source, list_sources, delete_source, retry_source,
link_source_to_note, unlink_source_from_note, preview_import, commit_import.
"""

import hashlib
import io
import logging
import os
import posixpath
import uuid
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from fastapi import UploadFile
from pypdf import PdfReader
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import (
    NoteNotFoundError,
    SourceNotFoundError,
    SourceNotRetryableError,
    UnsupportedSourceTypeError,
    UserNotFoundError,
    ValidationError,
    WorkspaceNotFoundError,
)
from app.models.note import Note
from app.models.note_link import NoteLink
from app.models.note_tag import NoteTag
from app.models.source import Source
from app.models.source_note_link import SourceNoteLink
from app.models.tag import Tag
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.source import (
    DetectedNote,
    SourceImportResponse,
    SourceImportResult,
    SourceListResponse,
    SourcePreviewResponse,
    SourceResponse,
)
from app.services import source_processing_service
from app.services.obsidian_parser import ParsedNote, parse_markdown_note

logger = logging.getLogger("app.services.source_service")

# File limit constants per contract §7.4
MAX_INDIVIDUAL_FILE_SIZE = 25 * 1024 * 1024  # 25 MB
MAX_FILES_PER_BATCH = 500
MAX_VAULT_ARCHIVE_SIZE = 250 * 1024 * 1024  # 250 MB
CHUNK_SIZE = 64 * 1024  # 64 KB streaming chunk

SUPPORTED_EXTENSIONS = {".md", ".markdown", ".txt", ".pdf"}


@dataclass
class IngestionItem:
    """An individual file extracted for ingestion."""

    original_path: str
    source_identifier: str
    source_type: str
    content_bytes: bytes
    content_hash: str
    parsed_note: ParsedNote | None = None
    error: str | None = None


def normalize_source_identifier(path: str) -> str:
    """Normalize file path to stable dedup key per contract §5.1, §5.5."""
    clean = path.replace("\\", "/").strip()
    normalized = posixpath.normpath(clean).lstrip("/")
    return normalized


def is_path_traversal(entry_name: str) -> bool:
    """Check if archive or upload entry attempts directory traversal per contract §12.2."""
    norm = posixpath.normpath(entry_name.replace("\\", "/"))
    return norm.startswith("..") or norm.startswith("/") or posixpath.isabs(norm)


def read_stream_with_limit(file: UploadFile, max_size: int) -> bytes:
    """Read upload stream enforcing max size limit per contract §12.2."""
    total = 0
    chunks: list[bytes] = []
    while True:
        chunk = file.file.read(CHUNK_SIZE)
        if not chunk:
            break
        total += len(chunk)
        if total > max_size:
            max_mb = max_size // (1024 * 1024)
            raise ValidationError(
                f"File '{file.filename}' exceeds maximum allowed size of {max_mb} MB."
            )
        chunks.append(chunk)
    return b"".join(chunks)


def detect_file_type_and_validate(filename: str, data: bytes) -> str:
    """Validate file type by content inspection (magic bytes) per contract §12.2 and §7.1."""
    ext = os.path.splitext(filename)[1].lower()

    if data.startswith(b"PK\x03\x04"):
        return "zip"
    if data.startswith(b"%PDF-"):
        return "pdf"

    # Check for text / markdown
    if ext in {".md", ".markdown", ".txt"}:
        try:
            data.decode("utf-8")
            return "markdown" if ext in {".md", ".markdown"} else "text"
        except UnicodeDecodeError:
            try:
                data.decode("latin-1")
                return "markdown" if ext in {".md", ".markdown"} else "text"
            except Exception as e:
                raise ValidationError(f"File '{filename}' contains invalid text encoding.") from e

    if ext == ".zip":
        raise ValidationError(f"File '{filename}' is not a valid zip archive.")
    if ext == ".pdf":
        raise ValidationError(f"File '{filename}' is not a valid PDF file.")

    raise UnsupportedSourceTypeError(
        f"File '{filename}' has unsupported type. Supported types: .md, .markdown, .txt, .pdf"
    )


def extract_pdf_content(data: bytes, filename: str) -> ParsedNote:
    """Extract text from PDF using pypdf per contract §14.1."""
    try:
        reader = PdfReader(io.BytesIO(data))
        title = ""
        if reader.metadata and reader.metadata.title:
            title = str(reader.metadata.title).strip()
        if not title:
            stem = os.path.splitext(os.path.basename(filename))[0]
            title = stem.replace("-", " ").replace("_", " ").title()

        pages_text = []
        for page in reader.pages:
            t = page.extract_text()
            if t:
                pages_text.append(t)
        full_content = "\n\n".join(pages_text)
        return ParsedNote(title=title, content=full_content)
    except Exception as e:
        raise ValueError(f"Failed to extract PDF text: {e}") from e


def _get_storage_dir(workspace_id: uuid.UUID) -> Path:
    base = Path(settings.GIT_REPOSITORY_ROOT).resolve()
    try:
        base.mkdir(parents=True, exist_ok=True)
    except (PermissionError, OSError):
        base = (Path.home() / ".knowledge-atlas" / "workspaces").resolve()
        base.mkdir(parents=True, exist_ok=True)
    source_dir = (base / str(workspace_id) / "sources").resolve()
    source_dir.mkdir(parents=True, exist_ok=True)
    return source_dir


# ── v0.4.1 Source System (CONTRACT §4.3, §7.1-§7.4, §10.1) ──────────────────────


def upload_source(
    db: Session,
    workspace_id: uuid.UUID,
    file_content: bytes,
    filename: str,
    content_type: str | None = None,
) -> Source:
    """Upload single source file and enqueue processing pipeline per CONTRACT v0.4.1 §7, §10.1."""
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError("Workspace not found.")

    if not file_content:
        raise ValidationError("Uploaded file is empty.")

    max_bytes = settings.SOURCE_MAX_FILE_SIZE_MB * 1024 * 1024
    if len(file_content) > max_bytes:
        raise ValidationError(
            f"File '{filename}' exceeds maximum allowed size of "
            f"{settings.SOURCE_MAX_FILE_SIZE_MB} MB."
        )

    if is_path_traversal(filename):
        raise ValidationError("Invalid filename or path traversal detected.")

    clean_filename = os.path.basename(filename.replace("\\", "/").strip())
    if not clean_filename:
        clean_filename = "uploaded_source"

    source_type = detect_file_type_and_validate(clean_filename, file_content)
    if source_type not in ("pdf", "markdown", "text"):
        raise UnsupportedSourceTypeError(
            f"Unsupported file type '{source_type}'. Supported types: PDF, Markdown, Plain text."
        )

    content_hash = hashlib.sha256(file_content).hexdigest()
    source_id = uuid.uuid4()

    # Save to workspace storage directory
    s_dir = _get_storage_dir(workspace_id)
    safe_name = f"{source_id}_{clean_filename}"
    file_path = s_dir / safe_name
    try:
        with open(file_path, "wb") as f:
            f.write(file_content)
    except Exception as e:
        logger.warning("Failed writing source file to disk: %s", e)

    import base64

    # Keep base64 in metadata for fast test/environment portability
    raw_metadata = {
        "storage_path": str(file_path),
        "filename": clean_filename,
        "file_size_bytes": len(file_content),
        "content_base64": base64.b64encode(file_content).decode("ascii"),
    }

    # Dedup or create Source row
    source = Source(
        id=source_id,
        workspace_id=workspace_id,
        note_id=None,
        source_type=source_type,
        original_path=clean_filename,
        source_identifier=normalize_source_identifier(clean_filename),
        content_hash=content_hash,
        import_batch_id=uuid.uuid4(),
        import_status="completed",
        raw_metadata=raw_metadata,
        error_message=None,
        imported_at=datetime.now(UTC),
        last_synced_at=None,
        processing_stage="upload",
        processing_status="PENDING",
        file_size_bytes=len(file_content),
        page_count=None,
        chunk_count=None,
        error_stage=None,
    )
    db.add(source)
    db.commit()
    db.refresh(source)

    # Process immediately in testing or development mode (or via worker in production)
    if settings.APP_ENV in ("testing", "development"):
        try:
            source_processing_service.process_source(db, source.id)
            db.refresh(source)
        except Exception as e:
            logger.warning("Synchronous source processing failed for %s: %s", source.id, e)

    return source


def get_source(db: Session, source_id: uuid.UUID) -> Source:
    """Retrieve a single Source record per CONTRACT §7.3, §10.1."""
    source = db.get(Source, source_id)
    if not source:
        raise SourceNotFoundError("Source not found.")
    return source


def list_sources(
    db: Session,
    workspace_id: uuid.UUID,
    page: int = 1,
    page_size: int = 50,
    processing_status: str | None = None,
) -> SourceListResponse:
    """List paginated sources for a workspace filterable by status per CONTRACT v0.4.1 §10.1."""
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError("Workspace not found.")

    offset = (page - 1) * page_size

    count_stmt = select(func.count(Source.id)).where(Source.workspace_id == workspace_id)
    if processing_status:
        count_stmt = count_stmt.where(Source.processing_status == processing_status)
    total = db.scalar(count_stmt) or 0

    query = (
        select(Source)
        .where(Source.workspace_id == workspace_id)
        .order_by(Source.imported_at.desc())
    )
    if processing_status:
        query = query.where(Source.processing_status == processing_status)

    sources = db.scalars(query.offset(offset).limit(page_size)).all()

    items = [SourceResponse.model_validate(s) for s in sources]
    return SourceListResponse(items=items, total=total, page=page, page_size=page_size)


def delete_source(db: Session, source_id: uuid.UUID) -> None:
    """Delete a source and all associated chunks, vectors, and links per CONTRACT §7.3, §10.1."""
    source = get_source(db, source_id)

    # 1. Delete vector points and ContentChunks
    try:
        source_processing_service.delete_source_chunks(db, source.id)
    except Exception as e:
        logger.warning("Error deleting chunks for source %s: %s", source.id, e)

    # 2. Delete source record (CASCADE deletes source_note_links)
    db.delete(source)
    db.commit()


def retry_source(db: Session, source_id: uuid.UUID) -> Source:
    """Retry a failed source via delete-then-reindex per CONTRACT v0.4.1 §7.3, §10.1."""
    source = get_source(db, source_id)

    if source.processing_status != "FAILED":
        raise SourceNotRetryableError(
            f"Source is in '{source.processing_status}' status. Only FAILED sources can be retried."
        )

    # 1. Delete existing chunks & vectors
    source_processing_service.delete_source_chunks(db, source.id)

    # 2. Reset processing status
    source.processing_status = "PENDING"
    source.processing_stage = "upload"
    source.error_stage = None
    source.error_message = None
    db.commit()
    db.refresh(source)

    # 3. Trigger reindex
    if settings.APP_ENV in ("testing", "development"):
        try:
            source_processing_service.process_source(db, source.id)
            db.refresh(source)
        except Exception as e:
            logger.warning("Synchronous source retry processing failed for %s: %s", source.id, e)

    return source


def link_source_to_note(db: Session, source_id: uuid.UUID, note_id: uuid.UUID) -> SourceNoteLink:
    """Link a source to a note per CONTRACT v0.4.1 §6.6, §10.1."""
    source = db.get(Source, source_id)
    if not source:
        raise SourceNotFoundError("Source not found.")

    note = db.get(Note, note_id)
    if not note:
        raise NoteNotFoundError("Note not found.")

    link = db.get(SourceNoteLink, (source_id, note_id))
    if not link:
        link = SourceNoteLink(
            source_id=source_id,
            note_id=note_id,
            created_at=datetime.now(UTC),
        )
        db.add(link)
        db.commit()
        db.refresh(link)

    return link


def unlink_source_from_note(db: Session, source_id: uuid.UUID, note_id: uuid.UUID) -> None:
    """Remove a source-note link per CONTRACT v0.4.1 §6.6, §10.1."""
    link = db.get(SourceNoteLink, (source_id, note_id))
    if link:
        db.delete(link)
        db.commit()


# ── v0.2.2 Vault Import Pipeline (Preserved for Backwards Compatibility) ─────────


def process_uploaded_files(files: list[UploadFile]) -> list[IngestionItem]:
    """Parse and validate uploaded files or zip vault into ingestion items."""
    if not files:
        raise ValidationError("Empty upload: at least one file is required.")

    items: list[IngestionItem] = []

    for file in files:
        filename = file.filename or "unnamed_file"
        ext = os.path.splitext(filename)[1].lower()

        is_zip = ext == ".zip"
        limit = MAX_VAULT_ARCHIVE_SIZE if is_zip else MAX_INDIVIDUAL_FILE_SIZE

        try:
            raw_bytes = read_stream_with_limit(file, limit)
        except ValidationError as e:
            items.append(
                IngestionItem(
                    original_path=filename,
                    source_identifier=normalize_source_identifier(filename),
                    source_type="unknown",
                    content_bytes=b"",
                    content_hash="",
                    error=str(e.message),
                )
            )
            continue

        if not raw_bytes:
            items.append(
                IngestionItem(
                    original_path=filename,
                    source_identifier=normalize_source_identifier(filename),
                    source_type="unknown",
                    content_bytes=b"",
                    content_hash="",
                    error="File is empty.",
                )
            )
            continue

        try:
            detected_type = detect_file_type_and_validate(filename, raw_bytes)
        except (ValidationError, UnsupportedSourceTypeError) as e:
            items.append(
                IngestionItem(
                    original_path=filename,
                    source_identifier=normalize_source_identifier(filename),
                    source_type="unknown",
                    content_bytes=raw_bytes,
                    content_hash=hashlib.sha256(raw_bytes).hexdigest(),
                    error=str(e.message),
                )
            )
            continue

        if detected_type == "zip":
            # Extract zip entries
            try:
                with zipfile.ZipFile(io.BytesIO(raw_bytes)) as zf:
                    for entry in zf.infolist():
                        if entry.is_dir():
                            continue

                        entry_name = entry.filename
                        if is_path_traversal(entry_name):
                            items.append(
                                IngestionItem(
                                    original_path=entry_name,
                                    source_identifier=normalize_source_identifier(entry_name),
                                    source_type="unknown",
                                    content_bytes=b"",
                                    content_hash="",
                                    error="Archive entry rejected due to path traversal attempt.",
                                )
                            )
                            continue

                        # Skip internal mac/hidden/system files
                        norm_entry = normalize_source_identifier(entry_name)
                        base_entry = posixpath.basename(norm_entry)
                        if (
                            base_entry.startswith(".")
                            or norm_entry.startswith("__MACOSX")
                            or "/.obsidian/" in f"/{norm_entry}/"
                        ):
                            continue

                        entry_ext = os.path.splitext(entry_name)[1].lower()
                        if entry_ext not in SUPPORTED_EXTENSIONS:
                            continue

                        if entry.file_size > MAX_INDIVIDUAL_FILE_SIZE:
                            max_mb = MAX_INDIVIDUAL_FILE_SIZE // (1024 * 1024)
                            items.append(
                                IngestionItem(
                                    original_path=entry_name,
                                    source_identifier=norm_entry,
                                    source_type="unknown",
                                    content_bytes=b"",
                                    content_hash="",
                                    error=f"Archive entry exceeds size limit of {max_mb} MB.",
                                )
                            )
                            continue

                        entry_bytes = zf.read(entry)
                        h = hashlib.sha256(entry_bytes).hexdigest()

                        if entry_ext in {".md", ".markdown"}:
                            stype = "obsidian_note"
                        elif entry_ext == ".pdf":
                            stype = "pdf"
                        else:
                            stype = "text"

                        try:
                            if entry_ext in {".md", ".markdown"}:
                                decoded = entry_bytes.decode("utf-8", errors="replace")
                                parsed = parse_markdown_note(decoded, entry_name)
                            elif entry_ext == ".pdf":
                                parsed = extract_pdf_content(entry_bytes, entry_name)
                            else:
                                text = entry_bytes.decode("utf-8", errors="replace")
                                stem = os.path.splitext(base_entry)[0]
                                title_str = stem.replace("-", " ").title()
                                parsed = ParsedNote(title=title_str, content=text)

                            items.append(
                                IngestionItem(
                                    original_path=entry_name,
                                    source_identifier=norm_entry,
                                    source_type=stype,
                                    content_bytes=entry_bytes,
                                    content_hash=h,
                                    parsed_note=parsed,
                                )
                            )
                        except Exception as e:
                            items.append(
                                IngestionItem(
                                    original_path=entry_name,
                                    source_identifier=norm_entry,
                                    source_type=stype,
                                    content_bytes=entry_bytes,
                                    content_hash=h,
                                    error=f"Parsing error: {e}",
                                )
                            )
            except zipfile.BadZipFile:
                items.append(
                    IngestionItem(
                        original_path=filename,
                        source_identifier=normalize_source_identifier(filename),
                        source_type="unknown",
                        content_bytes=b"",
                        content_hash="",
                        error="Corrupted or invalid zip archive.",
                    )
                )
        else:
            h = hashlib.sha256(raw_bytes).hexdigest()
            norm_name = normalize_source_identifier(filename)
            base_name = posixpath.basename(norm_name)

            try:
                if detected_type == "markdown":
                    decoded = raw_bytes.decode("utf-8", errors="replace")
                    parsed = parse_markdown_note(decoded, filename)
                elif detected_type == "pdf":
                    parsed = extract_pdf_content(raw_bytes, filename)
                else:
                    text = raw_bytes.decode("utf-8", errors="replace")
                    stem = os.path.splitext(base_name)[0]
                    title_str = stem.replace("-", " ").title()
                    parsed = ParsedNote(title=title_str, content=text)

                items.append(
                    IngestionItem(
                        original_path=filename,
                        source_identifier=norm_name,
                        source_type=detected_type,
                        content_bytes=raw_bytes,
                        content_hash=h,
                        parsed_note=parsed,
                    )
                )
            except Exception as e:
                items.append(
                    IngestionItem(
                        original_path=filename,
                        source_identifier=norm_name,
                        source_type=detected_type,
                        content_bytes=raw_bytes,
                        content_hash=h,
                        error=f"Parsing error: {e}",
                    )
                )

    if len(items) > MAX_FILES_PER_BATCH:
        raise ValidationError(
            f"Batch contains {len(items)} files, exceeding maximum of {MAX_FILES_PER_BATCH}."
        )

    return items


def preview_import(
    db: Session,
    workspace_id: uuid.UUID,
    files: list[UploadFile],
) -> SourcePreviewResponse:
    """Dry-run import preview per contract §7.1."""
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError()

    items = process_uploaded_files(files)

    existing_sources = db.scalars(select(Source).where(Source.workspace_id == workspace_id)).all()
    source_map = {s.source_identifier: s for s in existing_sources}

    workspace_notes = db.scalars(
        select(Note).where(Note.workspace_id == workspace_id, Note.is_archived.is_(False))
    ).all()
    existing_titles = {n.title.lower().strip() for n in workspace_notes}

    detected_notes: list[DetectedNote] = []
    errors: list[str] = []
    warnings: list[str] = []

    imported_titles = set(existing_titles)
    for item in items:
        if item.parsed_note:
            imported_titles.add(item.parsed_note.title.lower().strip())

    unresolved_link_count = 0

    for item in items:
        if item.error:
            errors.append(f"{item.original_path}: {item.error}")
            continue

        if not item.parsed_note:
            continue

        existing_src = source_map.get(item.source_identifier)
        is_dup = False
        will_update = False

        if existing_src:
            if existing_src.content_hash == item.content_hash:
                is_dup = True
            else:
                will_update = True

        detected_notes.append(
            DetectedNote(
                original_path=item.original_path,
                title=item.parsed_note.title,
                tag_count=len(item.parsed_note.tags),
                outgoing_link_count=len(item.parsed_note.wikilinks),
                is_duplicate=is_dup,
                will_update_existing=will_update,
            )
        )

        for link_target in item.parsed_note.wikilinks:
            if link_target.lower().strip() not in imported_titles:
                unresolved_link_count += 1
                warnings.append(f"{item.original_path}: unresolved wikilink [[{link_target}]]")

    return SourcePreviewResponse(
        detected_notes=detected_notes,
        unresolved_link_count=unresolved_link_count,
        warnings=warnings[:50],
        errors=errors,
    )


def _sync_note_tags(db: Session, note: Note, tag_names: list[str]) -> None:
    """Sync NoteTag relationships ensuring Tag records exist per contract §5.2."""
    current_note_tags = list(db.scalars(select(NoteTag).where(NoteTag.note_id == note.id)).all())
    for nt in current_note_tags:
        db.delete(nt)
    db.flush()

    for name in tag_names:
        clean_name = name.strip()
        if not clean_name:
            continue
        tag = db.scalars(
            select(Tag).where(Tag.workspace_id == note.workspace_id, Tag.name == clean_name)
        ).first()
        if not tag:
            tag = Tag(workspace_id=note.workspace_id, name=clean_name)
            db.add(tag)
            db.flush()

        db.add(NoteTag(note_id=note.id, tag_id=tag.id))


def commit_import(
    db: Session,
    workspace_id: uuid.UUID,
    files: list[UploadFile],
    created_by: uuid.UUID,
) -> SourceImportResponse:
    """Execute commit import per contract §5.2, §5.3, §5.4, §7.2."""
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError()

    user = db.get(User, created_by)
    if not user:
        raise UserNotFoundError()

    items = process_uploaded_files(files)

    existing_sources = db.scalars(select(Source).where(Source.workspace_id == workspace_id)).all()
    source_map = {s.source_identifier: s for s in existing_sources}

    import_batch_id = uuid.uuid4()
    now = datetime.now(UTC)

    imported_count = 0
    updated_count = 0
    skipped_count = 0
    failed_count = 0

    results: list[SourceImportResult] = []
    involved_notes: list[Note] = []
    processed_identifiers: set[str] = set()

    for item in items:
        processed_identifiers.add(item.source_identifier)

        if item.error:
            failed_count += 1
            results.append(
                SourceImportResult(
                    original_path=item.original_path,
                    status="failed",
                    note_id=None,
                    error=item.error,
                )
            )
            continue

        if not item.parsed_note:
            failed_count += 1
            results.append(
                SourceImportResult(
                    original_path=item.original_path,
                    status="failed",
                    note_id=None,
                    error="Failed to parse content.",
                )
            )
            continue

        existing = source_map.get(item.source_identifier)

        if existing:
            if existing.content_hash == item.content_hash:
                skipped_count += 1
                existing.last_synced_at = now
                existing.import_batch_id = import_batch_id
                results.append(
                    SourceImportResult(
                        original_path=item.original_path,
                        status="skipped",
                        note_id=existing.note_id,
                        error=None,
                    )
                )
            else:
                note = db.get(Note, existing.note_id) if existing.note_id else None
                if note:
                    note.title = item.parsed_note.title
                    note.content = item.parsed_note.content
                    note.metadata_ = item.parsed_note.frontmatter
                    note.updated_at = now
                    _sync_note_tags(db, note, item.parsed_note.tags)
                    involved_notes.append(note)
                else:
                    note = Note(
                        id=uuid.uuid4(),
                        workspace_id=workspace_id,
                        created_by=created_by,
                        title=item.parsed_note.title,
                        content=item.parsed_note.content,
                        metadata_=item.parsed_note.frontmatter,
                    )
                    db.add(note)
                    db.flush()
                    _sync_note_tags(db, note, item.parsed_note.tags)
                    existing.note_id = note.id
                    involved_notes.append(note)

                existing.content_hash = item.content_hash
                existing.import_batch_id = import_batch_id
                existing.import_status = "completed"
                existing.raw_metadata = item.parsed_note.frontmatter
                existing.last_synced_at = now
                existing.error_message = None

                updated_count += 1
                results.append(
                    SourceImportResult(
                        original_path=item.original_path,
                        status="completed",
                        note_id=note.id if note else None,
                        error=None,
                    )
                )
        else:
            note = Note(
                id=uuid.uuid4(),
                workspace_id=workspace_id,
                created_by=created_by,
                title=item.parsed_note.title,
                content=item.parsed_note.content,
                metadata_=item.parsed_note.frontmatter,
            )
            db.add(note)
            db.flush()

            _sync_note_tags(db, note, item.parsed_note.tags)
            involved_notes.append(note)

            new_source = Source(
                id=uuid.uuid4(),
                workspace_id=workspace_id,
                note_id=note.id,
                source_type=item.source_type,
                original_path=item.original_path,
                source_identifier=item.source_identifier,
                content_hash=item.content_hash,
                import_batch_id=import_batch_id,
                import_status="completed",
                raw_metadata=item.parsed_note.frontmatter,
                imported_at=now,
                last_synced_at=now,
                processing_stage="upload",
                processing_status="READY",
                file_size_bytes=len(item.content_bytes),
                page_count=None,
                chunk_count=None,
                error_stage=None,
            )
            db.add(new_source)
            source_map[item.source_identifier] = new_source

            imported_count += 1
            results.append(
                SourceImportResult(
                    original_path=item.original_path,
                    status="completed",
                    note_id=note.id,
                    error=None,
                )
            )

    db.flush()

    workspace_notes = db.scalars(
        select(Note).where(Note.workspace_id == workspace_id, Note.is_archived.is_(False))
    ).all()
    title_to_note = {n.title.lower().strip(): n for n in workspace_notes}

    for note in workspace_notes:
        from app.services.obsidian_parser import parse_wikilinks

        wikilinks = parse_wikilinks(note.content)
        for target_title in wikilinks:
            target = title_to_note.get(target_title.lower().strip())
            if target and target.id != note.id:
                link = db.get(NoteLink, (note.id, target.id))
                if not link:
                    db.add(NoteLink(source_note_id=note.id, target_note_id=target.id))

    removed_count = sum(
        1 for s in existing_sources if s.source_identifier not in processed_identifiers
    )

    db.commit()

    return SourceImportResponse(
        import_batch_id=import_batch_id,
        imported=imported_count,
        updated=updated_count,
        skipped=skipped_count,
        failed=failed_count,
        removed_since_last_import=removed_count,
        results=results,
    )
