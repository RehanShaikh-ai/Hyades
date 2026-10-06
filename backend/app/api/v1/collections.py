"""Collections API endpoints per CONTRACT v0.4.2 §8.1."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.collection import (
    CollectionConversation,
    CollectionEntity,
    CollectionNote,
    CollectionSource,
)
from app.models.workspace import Workspace
from app.schemas.collection import (
    CollectionCreate,
    CollectionListResponse,
    CollectionRelatedResponse,
    CollectionResponse,
    CollectionStatsResponse,
    CollectionUpdate,
)
from app.schemas.knowledge_item import (
    KnowledgeItemAddRequest,
    KnowledgeItemListResponse,
)
from app.services import collection_service, membership_service

router = APIRouter(tags=["collections"])


@router.post(
    "/workspaces/{workspace_id}/collections",
    response_model=CollectionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_collection(
    workspace_id: UUID,
    data: CollectionCreate,
    session: Annotated[Session, Depends(get_db)],
):
    ws = session.get(Workspace, workspace_id)
    if not ws:
        from app.core.exceptions import NotFoundError

        raise NotFoundError(f"Workspace '{workspace_id}' not found")

    return collection_service.create_collection(
        session=session,
        workspace_id=workspace_id,
        created_by=ws.owner_id,
        data=data,
    )


@router.get(
    "/workspaces/{workspace_id}/collections",
    response_model=CollectionListResponse,
)
def list_collections(
    workspace_id: UUID,
    session: Annotated[Session, Depends(get_db)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    items, total = collection_service.list_collections(
        session=session,
        workspace_id=workspace_id,
        page=page,
        page_size=page_size,
    )
    return CollectionListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/workspaces/{workspace_id}/collections/{collection_id}",
    response_model=CollectionResponse,
)
def get_collection(
    workspace_id: UUID,
    collection_id: UUID,
    session: Annotated[Session, Depends(get_db)],
):
    return collection_service.get_collection(session, collection_id)


@router.patch(
    "/workspaces/{workspace_id}/collections/{collection_id}",
    response_model=CollectionResponse,
)
def update_collection(
    workspace_id: UUID,
    collection_id: UUID,
    data: CollectionUpdate,
    session: Annotated[Session, Depends(get_db)],
):
    return collection_service.update_collection(session, collection_id, data)


@router.delete(
    "/workspaces/{workspace_id}/collections/{collection_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_collection(
    workspace_id: UUID,
    collection_id: UUID,
    session: Annotated[Session, Depends(get_db)],
):
    collection_service.delete_collection(session, collection_id)


@router.get(
    "/workspaces/{workspace_id}/collections/{collection_id}/items",
    response_model=KnowledgeItemListResponse,
)
def get_collection_items(
    workspace_id: UUID,
    collection_id: UUID,
    session: Annotated[Session, Depends(get_db)],
):
    items = collection_service.get_collection_items(session, collection_id)
    return KnowledgeItemListResponse(
        items=items,
        total=len(items),
        page=1,
        page_size=100,
    )


@router.post(
    "/workspaces/{workspace_id}/collections/{collection_id}/items",
    status_code=status.HTTP_201_CREATED,
)
def add_collection_item(
    workspace_id: UUID,
    collection_id: UUID,
    data: KnowledgeItemAddRequest,
    session: Annotated[Session, Depends(get_db)],
):
    collection = collection_service.get_collection(session, collection_id)
    membership_service.add_collection_item(
        session=session,
        collection=collection,
        item_type=data.item_type,
        item_id=data.item_id,
    )
    return {"status": "added"}


@router.delete(
    "/workspaces/{workspace_id}/collections/{collection_id}/items/{item_type}/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_collection_item(
    workspace_id: UUID,
    collection_id: UUID,
    item_type: str,
    item_id: UUID,
    session: Annotated[Session, Depends(get_db)],
):
    if item_type == "note":
        session.query(CollectionNote).filter(
            CollectionNote.collection_id == collection_id, CollectionNote.note_id == item_id
        ).delete()
    elif item_type == "source":
        session.query(CollectionSource).filter(
            CollectionSource.collection_id == collection_id, CollectionSource.source_id == item_id
        ).delete()
    elif item_type == "entity":
        session.query(CollectionEntity).filter(
            CollectionEntity.collection_id == collection_id, CollectionEntity.entity_id == item_id
        ).delete()
    elif item_type == "conversation":
        session.query(CollectionConversation).filter(
            CollectionConversation.collection_id == collection_id,
            CollectionConversation.conversation_id == item_id,
        ).delete()
    session.commit()


@router.get(
    "/workspaces/{workspace_id}/collections/{collection_id}/stats",
    response_model=CollectionStatsResponse,
)
def get_collection_stats(
    workspace_id: UUID,
    collection_id: UUID,
    session: Annotated[Session, Depends(get_db)],
):
    return collection_service.get_collection_stats(session, collection_id)


@router.get(
    "/workspaces/{workspace_id}/collections/{collection_id}/related",
    response_model=CollectionRelatedResponse,
)
def get_collection_related(
    workspace_id: UUID,
    collection_id: UUID,
    session: Annotated[Session, Depends(get_db)],
):
    related = collection_service.get_collection_related(session, collection_id)
    return CollectionRelatedResponse(
        collection_id=collection_id,
        related_entities=related,
    )
