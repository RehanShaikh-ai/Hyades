"""Conversation service for persistent AI assistant chat threads.

Canonical service per CONTRACT v0.4.1 §4.3, §6.3, §9.1, §10.2.
Provides create_conversation, get_conversation, list_conversations,
rename_conversation, delete_conversation.
"""

import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import (
    ConversationNotFoundError,
    ValidationError,
    WorkspaceNotFoundError,
)
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.workspace import Workspace

logger = logging.getLogger("app.services.conversation_service")


def create_conversation(
    db: Session,
    workspace_id: uuid.UUID,
    title: str | None = None,
) -> Conversation:
    """Create a new conversation thread in a workspace per CONTRACT §6.3, §9.1."""
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError("Workspace not found.")

    clean_title = title.strip() if title else None
    if clean_title and len(clean_title) > 200:
        clean_title = clean_title[:200]

    conversation = Conversation(
        id=uuid.uuid4(),
        workspace_id=workspace_id,
        title=clean_title,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


def get_conversation(db: Session, conversation_id: uuid.UUID) -> Conversation:
    """Retrieve a conversation with its messages and citations per CONTRACT §9.1, §10.2."""
    stmt = (
        select(Conversation)
        .where(Conversation.id == conversation_id)
        .options(selectinload(Conversation.messages).selectinload(Message.citations))
    )
    conv = db.scalars(stmt).first()
    if not conv:
        raise ConversationNotFoundError("Conversation not found.")
    return conv


def list_conversations(
    db: Session,
    workspace_id: uuid.UUID,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[Conversation], int]:
    """List paginated conversations for a workspace ordered newest first.

    Complies with CONTRACT §6.3, §10.2.
    """
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError("Workspace not found.")

    offset = (page - 1) * page_size

    total = (
        db.scalar(
            select(func.count(Conversation.id)).where(Conversation.workspace_id == workspace_id)
        )
        or 0
    )

    stmt = (
        select(Conversation)
        .where(Conversation.workspace_id == workspace_id)
        .options(selectinload(Conversation.messages))
        .order_by(Conversation.updated_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    conversations = list(db.scalars(stmt).all())

    return conversations, total


def rename_conversation(
    db: Session,
    conversation_id: uuid.UUID,
    title: str,
) -> Conversation:
    """Rename a conversation thread per CONTRACT §9.1, §10.2."""
    clean_title = title.strip()
    if not clean_title:
        raise ValidationError("Conversation title cannot be empty.")
    if len(clean_title) > 200:
        clean_title = clean_title[:200]

    conv = get_conversation(db, conversation_id)
    conv.title = clean_title
    conv.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(conv)
    return conv


def delete_conversation(db: Session, conversation_id: uuid.UUID) -> None:
    """Delete a conversation and all its messages CASCADE per CONTRACT §6.3, §9.1."""
    conv = get_conversation(db, conversation_id)
    db.delete(conv)
    db.commit()
