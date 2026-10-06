"""Thread service per CONTRACT v0.4.2 §5.3, §8.2."""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.models.conversation import Conversation
from app.models.graph_entity import GraphEntity
from app.models.note import Note
from app.models.source import Source
from app.models.thread import (
    Thread,
    ThreadConversation,
    ThreadDiscovery,
    ThreadEntity,
    ThreadNote,
    ThreadQuestion,
    ThreadSource,
)
from app.schemas.thread import (
    ThreadCreate,
    ThreadDiscoveryCreate,
    ThreadQuestionCreate,
    ThreadQuestionUpdate,
    ThreadUpdate,
)


def create_thread(
    session: Session,
    workspace_id: UUID,
    created_by: UUID,
    data: ThreadCreate,
) -> Thread:
    thread = Thread(
        workspace_id=workspace_id,
        created_by=created_by,
        title=data.title,
        question=data.question,
        status="active",
    )
    session.add(thread)
    session.commit()
    session.refresh(thread)
    return thread


def get_thread(session: Session, thread_id: UUID) -> Thread:
    thread = session.get(Thread, thread_id)
    if not thread:
        raise NotFoundError(f"Thread '{thread_id}' not found")
    return thread


def list_threads(
    session: Session,
    workspace_id: UUID,
    page: int = 1,
    page_size: int = 20,
    status: str | None = None,
) -> tuple[list[Thread], int]:
    stmt = select(Thread).where(Thread.workspace_id == workspace_id)
    count_stmt = select(func.count(Thread.id)).where(Thread.workspace_id == workspace_id)

    if status:
        stmt = stmt.where(Thread.status == status)
        count_stmt = count_stmt.where(Thread.status == status)

    stmt = stmt.order_by(Thread.updated_at.desc())

    total = session.scalar(count_stmt) or 0
    items = session.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).all()

    return list(items), total


def update_thread(
    session: Session,
    thread_id: UUID,
    data: ThreadUpdate,
) -> Thread:
    thread = get_thread(session, thread_id)
    if data.title is not None:
        thread.title = data.title
    if data.question is not None:
        thread.question = data.question
    if data.status is not None:
        thread.status = data.status

    session.commit()
    session.refresh(thread)
    return thread


def delete_thread(session: Session, thread_id: UUID) -> None:
    thread = get_thread(session, thread_id)
    session.delete(thread)
    session.commit()


def get_thread_items(session: Session, thread_id: UUID) -> list[dict]:
    thread = get_thread(session, thread_id)
    items = []

    notes_res = session.execute(
        select(ThreadNote, Note)
        .join(Note, ThreadNote.note_id == Note.id)
        .where(ThreadNote.thread_id == thread.id)
    )
    for tn, note in notes_res.all():
        items.append({
            "item_type": "note",
            "item_id": note.id,
            "title": note.title,
            "added_at": tn.added_at,
        })

    sources_res = session.execute(
        select(ThreadSource, Source)
        .join(Source, ThreadSource.source_id == Source.id)
        .where(ThreadSource.thread_id == thread.id)
    )
    for ts, src in sources_res.all():
        items.append({
            "item_type": "source",
            "item_id": src.id,
            "title": src.original_path.split("/")[-1],
            "added_at": ts.added_at,
        })

    entities_res = session.execute(
        select(ThreadEntity, GraphEntity)
        .join(GraphEntity, ThreadEntity.entity_id == GraphEntity.id)
        .where(ThreadEntity.thread_id == thread.id)
    )
    for te, ent in entities_res.all():
        items.append({
            "item_type": "entity",
            "item_id": ent.id,
            "title": ent.name,
            "added_at": te.added_at,
        })

    convs_res = session.execute(
        select(ThreadConversation, Conversation)
        .join(Conversation, ThreadConversation.conversation_id == Conversation.id)
        .where(ThreadConversation.thread_id == thread.id)
    )
    for tc, conv in convs_res.all():
        items.append({
            "item_type": "conversation",
            "item_id": conv.id,
            "title": conv.title,
            "added_at": tc.added_at,
        })

    return items


# Thread Questions
def create_thread_question(
    session: Session,
    thread_id: UUID,
    data: ThreadQuestionCreate,
) -> ThreadQuestion:
    get_thread(session, thread_id)
    q = ThreadQuestion(thread_id=thread_id, text=data.text)
    session.add(q)
    session.commit()
    session.refresh(q)
    return q


def list_thread_questions(session: Session, thread_id: UUID) -> list[ThreadQuestion]:
    get_thread(session, thread_id)
    stmt = select(ThreadQuestion).where(ThreadQuestion.thread_id == thread_id).order_by(ThreadQuestion.created_at.asc())
    return list(session.scalars(stmt).all())


def update_thread_question(
    session: Session,
    thread_id: UUID,
    question_id: UUID,
    data: ThreadQuestionUpdate,
) -> ThreadQuestion:
    get_thread(session, thread_id)
    q = session.get(ThreadQuestion, question_id)
    if not q or q.thread_id != thread_id:
        raise NotFoundError(f"Question '{question_id}' not found in thread")

    if data.text is not None:
        q.text = data.text
    if data.is_resolved is not None:
        q.is_resolved = data.is_resolved

    session.commit()
    session.refresh(q)
    return q


def delete_thread_question(session: Session, thread_id: UUID, question_id: UUID) -> None:
    get_thread(session, thread_id)
    q = session.get(ThreadQuestion, question_id)
    if not q or q.thread_id != thread_id:
        raise NotFoundError(f"Question '{question_id}' not found in thread")
    session.delete(q)
    session.commit()


# Thread Discoveries
def create_thread_discovery(
    session: Session,
    thread_id: UUID,
    data: ThreadDiscoveryCreate,
) -> ThreadDiscovery:
    get_thread(session, thread_id)
    d = ThreadDiscovery(thread_id=thread_id, content=data.content)
    session.add(d)
    session.commit()
    session.refresh(d)
    return d


def list_thread_discoveries(session: Session, thread_id: UUID) -> list[ThreadDiscovery]:
    get_thread(session, thread_id)
    stmt = select(ThreadDiscovery).where(ThreadDiscovery.thread_id == thread_id).order_by(ThreadDiscovery.created_at.desc())
    return list(session.scalars(stmt).all())


def delete_thread_discovery(session: Session, thread_id: UUID, discovery_id: UUID) -> None:
    get_thread(session, thread_id)
    d = session.get(ThreadDiscovery, discovery_id)
    if not d or d.thread_id != thread_id:
        raise NotFoundError(f"Discovery '{discovery_id}' not found in thread")
    session.delete(d)
    session.commit()


def get_thread_activity(session: Session, thread_id: UUID) -> list[dict]:
    thread = get_thread(session, thread_id)
    activities = []

    questions = list_thread_questions(session, thread_id)
    for q in questions:
        activities.append({
            "id": q.id,
            "activity_type": "question_created",
            "description": f"Added question: {q.text[:50]}...",
            "timestamp": q.created_at,
        })

    discoveries = list_thread_discoveries(session, thread_id)
    for d in discoveries:
        activities.append({
            "id": d.id,
            "activity_type": "discovery_logged",
            "description": f"Logged discovery: {d.content[:50]}...",
            "timestamp": d.created_at,
        })

    activities.sort(key=lambda x: x["timestamp"], reverse=True)
    return activities
