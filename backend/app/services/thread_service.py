"""Thread service managing research threads, questions, discoveries, and activity timelines.

Canonical module per CONTRACT v0.4.2 §5.3, §8.2.
"""

from datetime import UTC, datetime
import uuid
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.thread import (
    Thread,
    ThreadConversation,
    ThreadDiscovery,
    ThreadEntity,
    ThreadNote,
    ThreadQuestion,
    ThreadSource,
)
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.thread import (
    ThreadActivityItem,
    ThreadActivityResponse,
    ThreadCreate,
    ThreadDiscoveryCreate,
    ThreadDiscoveryResponse,
    ThreadQuestionCreate,
    ThreadQuestionResponse,
    ThreadQuestionUpdate,
    ThreadResponse,
    ThreadUpdate,
)


def _populate_thread_counts(db: Session, thread: Thread) -> ThreadResponse:
    q_count = db.query(ThreadQuestion).filter_by(thread_id=thread.id).count()
    d_count = db.query(ThreadDiscovery).filter_by(thread_id=thread.id).count()
    n_count = db.query(ThreadNote).filter_by(thread_id=thread.id).count()
    s_count = db.query(ThreadSource).filter_by(thread_id=thread.id).count()
    e_count = db.query(ThreadEntity).filter_by(thread_id=thread.id).count()
    c_count = db.query(ThreadConversation).filter_by(thread_id=thread.id).count()

    resp = ThreadResponse.model_validate(thread)
    resp.question_count = q_count
    resp.discovery_count = d_count
    resp.item_count = n_count + s_count + e_count + c_count
    return resp


def create_thread(
    db: Session, workspace_id: uuid.UUID, data: ThreadCreate, user_id: uuid.UUID | None = None
) -> ThreadResponse:
    """Create a new research thread."""
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    creator_id = user_id or data.created_by or ws.owner_id
    now = datetime.now(UTC)

    thread = Thread(
        workspace_id=workspace_id,
        title=data.title.strip(),
        question=data.question,
        status=data.status,
        created_by=creator_id,
        created_at=now,
        updated_at=now,
    )
    db.add(thread)
    db.commit()
    db.refresh(thread)

    return _populate_thread_counts(db, thread)


def get_thread(db: Session, thread_id: uuid.UUID) -> Thread:
    """Get thread or raise 404."""
    thread = db.query(Thread).filter(Thread.id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")
    return thread


def list_threads(
    db: Session, workspace_id: uuid.UUID, status_filter: str | None = None, page: int = 1, page_size: int = 20
) -> tuple[list[ThreadResponse], int]:
    """List threads in workspace ordered by updated_at descending."""
    q = db.query(Thread).filter(Thread.workspace_id == workspace_id)
    if status_filter:
        q = q.filter(Thread.status == status_filter)

    total = q.count()
    threads = (
        q.order_by(Thread.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    items = [_populate_thread_counts(db, t) for t in threads]
    return items, total


def update_thread(db: Session, thread_id: uuid.UUID, data: ThreadUpdate) -> ThreadResponse:
    """Update thread title, question, or status."""
    thread = get_thread(db, thread_id)

    if data.title is not None:
        thread.title = data.title.strip()
    if data.question is not None:
        thread.question = data.question
    if data.status is not None:
        thread.status = data.status

    thread.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(thread)

    return _populate_thread_counts(db, thread)


def delete_thread(db: Session, thread_id: uuid.UUID) -> None:
    """Delete thread. Cascades questions, discoveries, and memberships."""
    thread = get_thread(db, thread_id)
    db.delete(thread)
    db.commit()


# -- Questions (§8.2) --

def list_thread_questions(db: Session, thread_id: uuid.UUID) -> list[ThreadQuestionResponse]:
    get_thread(db, thread_id)
    questions = db.query(ThreadQuestion).filter_by(thread_id=thread_id).order_by(ThreadQuestion.created_at.asc()).all()
    return [ThreadQuestionResponse.model_validate(q) for q in questions]


def create_thread_question(db: Session, thread_id: uuid.UUID, data: ThreadQuestionCreate) -> ThreadQuestionResponse:
    thread = get_thread(db, thread_id)
    now = datetime.now(UTC)

    q = ThreadQuestion(
        thread_id=thread.id,
        text=data.text.strip(),
        is_resolved=False,
        created_at=now,
        updated_at=now,
    )
    db.add(q)
    thread.updated_at = now
    db.commit()
    db.refresh(q)
    return ThreadQuestionResponse.model_validate(q)


def update_thread_question(
    db: Session, thread_id: uuid.UUID, question_id: uuid.UUID, data: ThreadQuestionUpdate
) -> ThreadQuestionResponse:
    q = db.query(ThreadQuestion).filter_by(id=question_id, thread_id=thread_id).first()
    if not q:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

    if data.text is not None:
        q.text = data.text.strip()
    if data.is_resolved is not None:
        q.is_resolved = data.is_resolved

    now = datetime.now(UTC)
    q.updated_at = now
    db.query(Thread).filter_by(id=thread_id).update({"updated_at": now})
    db.commit()
    db.refresh(q)
    return ThreadQuestionResponse.model_validate(q)


def delete_thread_question(db: Session, thread_id: uuid.UUID, question_id: uuid.UUID) -> None:
    q = db.query(ThreadQuestion).filter_by(id=question_id, thread_id=thread_id).first()
    if not q:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
    db.delete(q)
    db.commit()


# -- Discoveries (§8.2) --

def list_thread_discoveries(db: Session, thread_id: uuid.UUID) -> list[ThreadDiscoveryResponse]:
    get_thread(db, thread_id)
    discoveries = db.query(ThreadDiscovery).filter_by(thread_id=thread_id).order_by(ThreadDiscovery.created_at.asc()).all()
    return [ThreadDiscoveryResponse.model_validate(d) for d in discoveries]


def create_thread_discovery(db: Session, thread_id: uuid.UUID, data: ThreadDiscoveryCreate) -> ThreadDiscoveryResponse:
    thread = get_thread(db, thread_id)
    now = datetime.now(UTC)

    d = ThreadDiscovery(
        thread_id=thread.id,
        content=data.content.strip(),
        created_at=now,
    )
    db.add(d)
    thread.updated_at = now
    db.commit()
    db.refresh(d)
    return ThreadDiscoveryResponse.model_validate(d)


def delete_thread_discovery(db: Session, thread_id: uuid.UUID, discovery_id: uuid.UUID) -> None:
    d = db.query(ThreadDiscovery).filter_by(id=discovery_id, thread_id=thread_id).first()
    if not d:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discovery not found")
    db.delete(d)
    db.commit()


# -- Activity Timeline (§8.2) --

def get_thread_activity(db: Session, thread: Thread) -> ThreadActivityResponse:
    """Aggregate activity items in reverse chronological order."""
    activity: list[ThreadActivityItem] = []

    # 1. Thread creation
    activity.append(ThreadActivityItem(
        activity_type="thread_created",
        timestamp=thread.created_at,
        summary=f"Created thread: {thread.title}",
        metadata={"title": thread.title, "question": thread.question},
    ))

    # 2. Questions
    for q in db.query(ThreadQuestion).filter_by(thread_id=thread.id).all():
        activity.append(ThreadActivityItem(
            activity_type="question_added",
            timestamp=q.created_at,
            summary=f"Question: {q.text}",
            metadata={"question_id": str(q.id), "is_resolved": q.is_resolved},
        ))
        if q.is_resolved:
            activity.append(ThreadActivityItem(
                activity_type="question_resolved",
                timestamp=q.updated_at,
                summary=f"Resolved question: {q.text}",
                metadata={"question_id": str(q.id)},
            ))

    # 3. Discoveries
    for d in db.query(ThreadDiscovery).filter_by(thread_id=thread.id).all():
        activity.append(ThreadActivityItem(
            activity_type="discovery_logged",
            timestamp=d.created_at,
            summary=f"Discovery: {d.content[:100]}...",
            metadata={"discovery_id": str(d.id), "full_content": d.content},
        ))

    # 4. Item memberships
    for tn in db.query(ThreadNote).filter_by(thread_id=thread.id).all():
        activity.append(ThreadActivityItem(
            activity_type="item_added",
            timestamp=tn.added_at,
            summary="Added note to thread",
            metadata={"item_type": "note", "item_id": str(tn.note_id)},
        ))
    for ts in db.query(ThreadSource).filter_by(thread_id=thread.id).all():
        activity.append(ThreadActivityItem(
            activity_type="item_added",
            timestamp=ts.added_at,
            summary="Added source to thread",
            metadata={"item_type": "source", "item_id": str(ts.source_id)},
        ))
    for te in db.query(ThreadEntity).filter_by(thread_id=thread.id).all():
        activity.append(ThreadActivityItem(
            activity_type="item_added",
            timestamp=te.added_at,
            summary="Added entity to thread",
            metadata={"item_type": "entity", "item_id": str(te.entity_id)},
        ))
    for tc in db.query(ThreadConversation).filter_by(thread_id=thread.id).all():
        activity.append(ThreadActivityItem(
            activity_type="item_added",
            timestamp=tc.added_at,
            summary="Added conversation to thread",
            metadata={"item_type": "conversation", "item_id": str(tc.conversation_id)},
        ))

    activity.sort(key=lambda x: x.timestamp, reverse=True)

    return ThreadActivityResponse(
        thread_id=thread.id,
        items=activity,
        total=len(activity),
    )
