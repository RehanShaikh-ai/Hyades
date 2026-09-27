"""Message service for conversation history and message management.

Canonical service per CONTRACT v0.4.1 §4.3, §6.4, §6.5, §9.1, §9.2.
Provides create_message, list_messages, get_message.
"""

import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import (
    ConversationNotFoundError,
    MessageNotFoundError,
    ValidationError,
)
from app.models.conversation import Conversation
from app.models.message import Message

logger = logging.getLogger("app.services.message_service")


def auto_generate_title(content: str) -> str:
    """Generate title from first 100 chars of user message at word boundary per §6.3."""
    clean = content.strip().replace("\n", " ")
    if len(clean) <= 100:
        return clean

    truncated = clean[:100]
    last_space = truncated.rfind(" ")
    if last_space > 20:
        return truncated[:last_space]
    return truncated


def create_message(
    db: Session,
    conversation_id: uuid.UUID,
    role: str,
    content: str,
    provider: str | None = None,
    model: str | None = None,
    latency_ms: int | None = None,
) -> Message:
    """Persist a message in a conversation per CONTRACT §6.3, §6.4, §9.2."""
    if role not in ("user", "assistant"):
        raise ValidationError(f"Invalid role '{role}'. Must be 'user' or 'assistant'.")

    clean_content = content.strip()
    if not clean_content:
        raise ValidationError("Message content cannot be empty.")
    if len(clean_content) > 4000:
        clean_content = clean_content[:4000]

    conv = db.get(Conversation, conversation_id)
    if not conv:
        raise ConversationNotFoundError("Conversation not found.")

    # Auto-generate title on first user message if title is not set (§6.3)
    if role == "user" and not conv.title:
        conv.title = auto_generate_title(clean_content)

    now = datetime.now(UTC)
    conv.updated_at = now

    message = Message(
        id=uuid.uuid4(),
        conversation_id=conv.id,
        workspace_id=conv.workspace_id,
        role=role,
        content=clean_content,
        provider=provider,
        model=model,
        latency_ms=latency_ms,
        created_at=now,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    db.refresh(conv)
    return message


def list_messages(db: Session, conversation_id: uuid.UUID) -> list[Message]:
    """Retrieve message history for a conversation ordered oldest-first per CONTRACT §6.7, §9.1."""
    conv = db.get(Conversation, conversation_id)
    if not conv:
        raise ConversationNotFoundError("Conversation not found.")

    stmt = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .options(selectinload(Message.citations))
        .order_by(Message.created_at.asc())
    )
    messages = list(db.scalars(stmt).all())
    return messages


def get_message(db: Session, message_id: uuid.UUID) -> Message:
    """Retrieve a single message with citations per CONTRACT §9.1, §11."""
    stmt = select(Message).where(Message.id == message_id).options(selectinload(Message.citations))
    msg = db.scalars(stmt).first()
    if not msg:
        raise MessageNotFoundError("Message not found.")
    return msg
