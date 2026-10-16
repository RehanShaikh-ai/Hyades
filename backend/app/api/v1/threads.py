"""Threads API endpoints per CONTRACT v0.4.2 §8.2.
"""

from typing import Annotated
import uuid
from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.collection import (
    KnowledgeItemAddRequest,
    KnowledgeItemListResponse,
    KnowledgeItemResponse,
    KnowledgeItemType,
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


@router.post("/threads", response_model=ThreadResponse, status_code=status.HTTP_201_CREATED)
@router.post("/workspaces/{workspace_id}/threads", response_model=ThreadResponse, status_code=status.HTTP_201_CREATED)
def create_thread(
    data: ThreadCreate,
    db: Annotated[Session, Depends(get_db)],
    workspace_id: uuid.UUID | None = None,
) -> ThreadResponse:
    ws_id = workspace_id or data.workspace_id
    if not ws_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="workspace_id is required")
    return thread_service.create_thread(db, ws_id, data)


@router.get("/threads", response_model=ThreadListResponse)
@router.get("/workspaces/{workspace_id}/threads", response_model=ThreadListResponse)
def list_threads(
    db: Annotated[Session, Depends(get_db)],
    workspace_id: uuid.UUID | None = None,
    status_filter: str | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> ThreadListResponse:
    if not workspace_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="workspace_id is required")
    items, total = thread_service.list_threads(db, workspace_id, status_filter, page, page_size)
    return ThreadListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/threads/{thread_id}", response_model=ThreadResponse)
def get_thread(
    thread_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> ThreadResponse:
    t = thread_service.get_thread(db, thread_id)
    return thread_service._populate_thread_counts(db, t)


@router.patch("/threads/{thread_id}", response_model=ThreadResponse)
def update_thread(
    thread_id: uuid.UUID,
    data: ThreadUpdate,
    db: Annotated[Session, Depends(get_db)],
) -> ThreadResponse:
    return thread_service.update_thread(db, thread_id, data)


@router.delete("/threads/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_thread(
    thread_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    thread_service.delete_thread(db, thread_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# -- Membership Endpoints (§8.2) --

@router.get("/threads/{thread_id}/items", response_model=KnowledgeItemListResponse)
def list_thread_items(
    thread_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> KnowledgeItemListResponse:
    t = thread_service.get_thread(db, thread_id)
    return membership_service.list_thread_items(db, t, page, page_size)


@router.post("/threads/{thread_id}/items", response_model=KnowledgeItemResponse, status_code=status.HTTP_201_CREATED)
def add_thread_item(
    thread_id: uuid.UUID,
    req: KnowledgeItemAddRequest,
    db: Annotated[Session, Depends(get_db)],
) -> KnowledgeItemResponse:
    t = thread_service.get_thread(db, thread_id)
    return membership_service.add_thread_item(db, t, req.item_type, req.item_id)


@router.delete("/threads/{thread_id}/items/{item_type}/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_thread_item(
    thread_id: uuid.UUID,
    item_type: KnowledgeItemType,
    item_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    t = thread_service.get_thread(db, thread_id)
    membership_service.remove_thread_item(db, t, item_type, item_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# -- Questions Endpoints (§8.2) --

@router.get("/threads/{thread_id}/questions", response_model=list[ThreadQuestionResponse])
def list_thread_questions(
    thread_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> list[ThreadQuestionResponse]:
    return thread_service.list_thread_questions(db, thread_id)


@router.post("/threads/{thread_id}/questions", response_model=ThreadQuestionResponse, status_code=status.HTTP_201_CREATED)
def create_thread_question(
    thread_id: uuid.UUID,
    data: ThreadQuestionCreate,
    db: Annotated[Session, Depends(get_db)],
) -> ThreadQuestionResponse:
    return thread_service.create_thread_question(db, thread_id, data)


@router.patch("/threads/{thread_id}/questions/{question_id}", response_model=ThreadQuestionResponse)
def update_thread_question(
    thread_id: uuid.UUID,
    question_id: uuid.UUID,
    data: ThreadQuestionUpdate,
    db: Annotated[Session, Depends(get_db)],
) -> ThreadQuestionResponse:
    return thread_service.update_thread_question(db, thread_id, question_id, data)


@router.delete("/threads/{thread_id}/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_thread_question(
    thread_id: uuid.UUID,
    question_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    thread_service.delete_thread_question(db, thread_id, question_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# -- Discoveries Endpoints (§8.2) --

@router.get("/threads/{thread_id}/discoveries", response_model=list[ThreadDiscoveryResponse])
def list_thread_discoveries(
    thread_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> list[ThreadDiscoveryResponse]:
    return thread_service.list_thread_discoveries(db, thread_id)


@router.post("/threads/{thread_id}/discoveries", response_model=ThreadDiscoveryResponse, status_code=status.HTTP_201_CREATED)
def create_thread_discovery(
    thread_id: uuid.UUID,
    data: ThreadDiscoveryCreate,
    db: Annotated[Session, Depends(get_db)],
) -> ThreadDiscoveryResponse:
    return thread_service.create_thread_discovery(db, thread_id, data)


@router.delete("/threads/{thread_id}/discoveries/{discovery_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_thread_discovery(
    thread_id: uuid.UUID,
    discovery_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    thread_service.delete_thread_discovery(db, thread_id, discovery_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# -- Activity Timeline (§8.2) --

@router.get("/threads/{thread_id}/activity", response_model=ThreadActivityResponse)
def get_thread_activity(
    thread_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> ThreadActivityResponse:
    t = thread_service.get_thread(db, thread_id)
    return thread_service.get_thread_activity(db, t)
