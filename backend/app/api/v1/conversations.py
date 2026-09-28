"""Conversation and AI Assistant endpoints.

Canonical endpoints per CONTRACT v0.4.1 §9.1, §9.2, §10.2.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.conversation import (
    ConversationCreate,
    ConversationListResponse,
    ConversationRenameRequest,
    ConversationResponse,
)
from app.schemas.message import MessageCreate, MessageResponse
from app.services import assistant_service, conversation_service, message_service

router = APIRouter(tags=["conversations"])


@router.post(
    "/workspaces/{workspace_id}/conversations",
    response_model=ConversationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_workspace_conversation(
    workspace_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    body: ConversationCreate | None = None,
) -> ConversationResponse:
    """Create a new conversation in a workspace per CONTRACT v0.4.1 §9.1, §10.2."""
    title = body.title if body else None
    conv = conversation_service.create_conversation(db, workspace_id, title=title)
    return ConversationResponse.model_validate(conv)


@router.get(
    "/workspaces/{workspace_id}/conversations",
    response_model=ConversationListResponse,
    status_code=status.HTTP_200_OK,
)
def list_workspace_conversations(
    workspace_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 50,
) -> ConversationListResponse:
    """List paginated conversations for a workspace per CONTRACT v0.4.1 §9.1, §10.2."""
    items, total = conversation_service.list_conversations(
        db, workspace_id, page=page, page_size=page_size
    )
    validated_items = [ConversationResponse.model_validate(c) for c in items]
    return ConversationListResponse(
        items=validated_items, total=total, page=page, page_size=page_size
    )


@router.get(
    "/conversations/{conversation_id}",
    response_model=ConversationResponse,
    status_code=status.HTTP_200_OK,
)
def get_conversation(
    conversation_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> ConversationResponse:
    """Retrieve conversation details with messages and citations per CONTRACT v0.4.1 §9.1, §10.2."""
    conv = conversation_service.get_conversation(db, conversation_id)
    return ConversationResponse.model_validate(conv)


@router.patch(
    "/conversations/{conversation_id}",
    response_model=ConversationResponse,
    status_code=status.HTTP_200_OK,
)
def rename_conversation(
    conversation_id: uuid.UUID,
    body: ConversationRenameRequest,
    db: Annotated[Session, Depends(get_db)],
) -> ConversationResponse:
    """Rename a conversation thread per CONTRACT v0.4.1 §9.1, §10.2."""
    conv = conversation_service.rename_conversation(db, conversation_id, body.title)
    return ConversationResponse.model_validate(conv)


@router.delete(
    "/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_conversation(
    conversation_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Delete a conversation and all its messages CASCADE per CONTRACT v0.4.1 §9.1, §10.2."""
    conversation_service.delete_conversation(db, conversation_id)


@router.post(
    "/conversations/{conversation_id}/messages",
    status_code=status.HTTP_201_CREATED,
)
def send_conversation_message(
    conversation_id: uuid.UUID,
    body: MessageCreate,
    db: Annotated[Session, Depends(get_db)],
):
    """Send user message and receive AI assistant response (streaming or non-streaming).

    Complies with CONTRACT §9.2, §10.2.
    """
    if body.stream:
        generator = assistant_service.stream_assistant_response(
            db=db,
            conversation_id=conversation_id,
            content=body.content,
        )
        return StreamingResponse(
            generator,
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    else:
        response = assistant_service.run_assistant(
            db=db,
            conversation_id=conversation_id,
            content=body.content,
            stream=False,
        )
        return response


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=list[MessageResponse],
    status_code=status.HTTP_200_OK,
)
def list_conversation_messages(
    conversation_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> list[MessageResponse]:
    """Retrieve message history for a conversation per CONTRACT v0.4.1 §9.1, §10.2."""
    messages = message_service.list_messages(db, conversation_id)
    return [MessageResponse.model_validate(m) for m in messages]
