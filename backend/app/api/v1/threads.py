"""Threads API endpoints per CONTRACT v0.4.2 §8.2."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.thread import (
    ThreadConversation,
    ThreadEntity,
    ThreadNote,
    ThreadSource,
)
from app.models.workspace import Workspace
from app.schemas.knowledge_item import (
    KnowledgeItemAddRequest,
    KnowledgeItemListResponse,
)
from app.schemas.thread import (
    ThreadActivityResponse,
    ThreadCreate,
    ThreadDiscoveryCreate,
    ThreadDiscoveryResponse,
    ThreadListResponse,
    ThreadQuestionCreate,
    ThreadQuestionResponse,
    ThreadQuestionUpdate,
    ThreadResponse,
    ThreadUpdate,
)
from app.services import membership_service, thread_service

router = APIRouter(tags=["threads"])


@router.post(
    "/workspaces/{workspace_id}/threads",
    response_model=ThreadResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_thread(
    workspace_id: UUID,
    data: ThreadCreate,
    session: Annotated[Session, Depends(get_db)],
):
    ws = session.get(Workspace, workspace_id)
    if not ws:
        from app.core.exceptions import NotFoundError

        raise NotFoundError(f"Workspace '{workspace_id}' not found")

    return thread_service.create_thread(
        session=session,
        workspace_id=workspace_id,
        created_by=ws.owner_id,
        data=data,
    )


@router.get(
    "/workspaces/{workspace_id}/threads",
    response_model=ThreadListResponse,
)
def list_threads(
    workspace_id: UUID,
    session: Annotated[Session, Depends(get_db)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status: str | None = Query(default=None),
):
    items, total = thread_service.list_threads(
        session=session,
        workspace_id=workspace_id,
        page=page,
        page_size=page_size,
        status=status,
    )
    return ThreadListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/workspaces/{workspace_id}/threads/{thread_id}",
    response_model=ThreadResponse,
)
def get_thread(
    workspace_id: UUID,
    thread_id: UUID,
    session: Annotated[Session, Depends(get_db)],
):
    return thread_service.get_thread(session, thread_id)


@router.patch(
    "/workspaces/{workspace_id}/threads/{thread_id}",
    response_model=ThreadResponse,
)
def update_thread(
    workspace_id: UUID,
    thread_id: UUID,
    data: ThreadUpdate,
    session: Annotated[Session, Depends(get_db)],
):
    return thread_service.update_thread(session, thread_id, data)


@router.delete(
    "/workspaces/{workspace_id}/threads/{thread_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_thread(
    workspace_id: UUID,
    thread_id: UUID,
    session: Annotated[Session, Depends(get_db)],
):
    thread_service.delete_thread(session, thread_id)


@router.get(
    "/workspaces/{workspace_id}/threads/{thread_id}/items",
    response_model=KnowledgeItemListResponse,
)
def get_thread_items(
    workspace_id: UUID,
    thread_id: UUID,
    session: Annotated[Session, Depends(get_db)],
):
    items = thread_service.get_thread_items(session, thread_id)
    return KnowledgeItemListResponse(
        items=items,
        total=len(items),
        page=1,
        page_size=100,
    )


@router.post(
    "/workspaces/{workspace_id}/threads/{thread_id}/items",
    status_code=status.HTTP_201_CREATED,
)
def add_thread_item(
    workspace_id: UUID,
    thread_id: UUID,
    data: KnowledgeItemAddRequest,
    session: Annotated[Session, Depends(get_db)],
):
    thread = thread_service.get_thread(session, thread_id)
    membership_service.add_thread_item(
        session=session,
        thread=thread,
        item_type=data.item_type,
        item_id=data.item_id,
    )
    return {"status": "added"}


@router.delete(
    "/workspaces/{workspace_id}/threads/{thread_id}/items/{item_type}/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_thread_item(
    workspace_id: UUID,
    thread_id: UUID,
    item_type: str,
    item_id: UUID,
    session: Annotated[Session, Depends(get_db)],
):
    if item_type == "note":
        session.query(ThreadNote).filter(
            ThreadNote.thread_id == thread_id, ThreadNote.note_id == item_id
        ).delete()
    elif item_type == "source":
        session.query(ThreadSource).filter(
            ThreadSource.thread_id == thread_id, ThreadSource.source_id == item_id
        ).delete()
    elif item_type == "entity":
        session.query(ThreadEntity).filter(
            ThreadEntity.thread_id == thread_id, ThreadEntity.entity_id == item_id
        ).delete()
    elif item_type == "conversation":
        session.query(ThreadConversation).filter(
            ThreadConversation.thread_id == thread_id, ThreadConversation.conversation_id == item_id
        ).delete()
    session.commit()


# Questions
@router.get(
    "/workspaces/{workspace_id}/threads/{thread_id}/questions",
    response_model=list[ThreadQuestionResponse],
)
def list_thread_questions(
    workspace_id: UUID,
    thread_id: UUID,
    session: Annotated[Session, Depends(get_db)],
):
    return thread_service.list_thread_questions(session, thread_id)


@router.post(
    "/workspaces/{workspace_id}/threads/{thread_id}/questions",
    response_model=ThreadQuestionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_thread_question(
    workspace_id: UUID,
    thread_id: UUID,
    data: ThreadQuestionCreate,
    session: Annotated[Session, Depends(get_db)],
):
    return thread_service.create_thread_question(session, thread_id, data)


@router.patch(
    "/workspaces/{workspace_id}/threads/{thread_id}/questions/{question_id}",
    response_model=ThreadQuestionResponse,
)
def update_thread_question(
    workspace_id: UUID,
    thread_id: UUID,
    question_id: UUID,
    data: ThreadQuestionUpdate,
    session: Annotated[Session, Depends(get_db)],
):
    return thread_service.update_thread_question(session, thread_id, question_id, data)


@router.delete(
    "/workspaces/{workspace_id}/threads/{thread_id}/questions/{question_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_thread_question(
    workspace_id: UUID,
    thread_id: UUID,
    question_id: UUID,
    session: Annotated[Session, Depends(get_db)],
):
    thread_service.delete_thread_question(session, thread_id, question_id)


# Discoveries
@router.get(
    "/workspaces/{workspace_id}/threads/{thread_id}/discoveries",
    response_model=list[ThreadDiscoveryResponse],
)
def list_thread_discoveries(
    workspace_id: UUID,
    thread_id: UUID,
    session: Annotated[Session, Depends(get_db)],
):
    return thread_service.list_thread_discoveries(session, thread_id)


@router.post(
    "/workspaces/{workspace_id}/threads/{thread_id}/discoveries",
    response_model=ThreadDiscoveryResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_thread_discovery(
    workspace_id: UUID,
    thread_id: UUID,
    data: ThreadDiscoveryCreate,
    session: Annotated[Session, Depends(get_db)],
):
    return thread_service.create_thread_discovery(session, thread_id, data)


@router.delete(
    "/workspaces/{workspace_id}/threads/{thread_id}/discoveries/{discovery_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_thread_discovery(
    workspace_id: UUID,
    thread_id: UUID,
    discovery_id: UUID,
    session: Annotated[Session, Depends(get_db)],
):
    thread_service.delete_thread_discovery(session, thread_id, discovery_id)


@router.get(
    "/workspaces/{workspace_id}/threads/{thread_id}/activity",
    response_model=ThreadActivityResponse,
)
def get_thread_activity(
    workspace_id: UUID,
    thread_id: UUID,
    session: Annotated[Session, Depends(get_db)],
):
    items = thread_service.get_thread_activity(session, thread_id)
    return ThreadActivityResponse(items=items, total=len(items))
