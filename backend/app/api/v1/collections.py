"""Collections API endpoints per CONTRACT v0.4.2 §8.1."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.collection import (
    CollectionCreate,
    CollectionListResponse,
    CollectionRelatedResponse,
    CollectionResponse,
    CollectionStatsResponse,
    CollectionUpdate,
    KnowledgeItemAddRequest,
    KnowledgeItemListResponse,
    KnowledgeItemResponse,
    KnowledgeItemType,
)
from app.services import collection_service, membership_service

router = APIRouter(tags=["collections"])


@router.post("/collections", response_model=CollectionResponse, status_code=status.HTTP_201_CREATED)
@router.post(
    "/workspaces/{workspace_id}/collections",
    response_model=CollectionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_collection(
    data: CollectionCreate,
    db: Annotated[Session, Depends(get_db)],
    workspace_id: uuid.UUID | None = None,
) -> CollectionResponse:
    ws_id = workspace_id or data.workspace_id
    if not ws_id:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="workspace_id is required"
        )
    return collection_service.create_collection(db, ws_id, data)


@router.get("/collections", response_model=CollectionListResponse)
@router.get("/workspaces/{workspace_id}/collections", response_model=CollectionListResponse)
def list_collections(
    db: Annotated[Session, Depends(get_db)],
    workspace_id: uuid.UUID | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> CollectionListResponse:
    if not workspace_id:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="workspace_id is required"
        )
    items, total = collection_service.list_collections(db, workspace_id, page, page_size)
    return CollectionListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/collections/{collection_id}", response_model=CollectionResponse)
def get_collection(
    collection_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> CollectionResponse:
    coll = collection_service.get_collection(db, collection_id)
    resp = CollectionResponse.model_validate(coll)
    resp.item_count = collection_service._get_item_count(db, coll.id)
    return resp


@router.patch("/collections/{collection_id}", response_model=CollectionResponse)
def update_collection(
    collection_id: uuid.UUID,
    data: CollectionUpdate,
    db: Annotated[Session, Depends(get_db)],
) -> CollectionResponse:
    return collection_service.update_collection(db, collection_id, data)


@router.delete("/collections/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_collection(
    collection_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    collection_service.delete_collection(db, collection_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# -- Membership Endpoints (§8.1) --


@router.get("/collections/{collection_id}/items", response_model=KnowledgeItemListResponse)
def list_collection_items(
    collection_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> KnowledgeItemListResponse:
    coll = collection_service.get_collection(db, collection_id)
    return membership_service.list_collection_items(db, coll, page, page_size)


@router.post(
    "/collections/{collection_id}/items",
    response_model=KnowledgeItemResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_collection_item(
    collection_id: uuid.UUID,
    req: KnowledgeItemAddRequest,
    db: Annotated[Session, Depends(get_db)],
) -> KnowledgeItemResponse:
    coll = collection_service.get_collection(db, collection_id)
    return membership_service.add_collection_item(db, coll, req.item_type, req.item_id)


@router.delete(
    "/collections/{collection_id}/items/{item_type}/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_collection_item(
    collection_id: uuid.UUID,
    item_type: KnowledgeItemType,
    item_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    coll = collection_service.get_collection(db, collection_id)
    membership_service.remove_collection_item(db, coll, item_type, item_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# -- Stats & Related Knowledge (§8.1, §14.3) --


@router.get("/collections/{collection_id}/stats", response_model=CollectionStatsResponse)
def get_collection_stats(
    collection_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> CollectionStatsResponse:
    coll = collection_service.get_collection(db, collection_id)
    return membership_service.get_collection_stats(db, coll)


@router.get("/collections/{collection_id}/related", response_model=CollectionRelatedResponse)
def get_collection_related(
    collection_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> CollectionRelatedResponse:
    coll = collection_service.get_collection(db, collection_id)
    return collection_service.get_related_knowledge(db, coll)
