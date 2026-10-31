"""Stella slash command and in-chat action endpoints.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.stella_commands import (
    StellaAddToCollectionCommitRequest,
    StellaAddToCollectionCommitResponse,
    StellaAddToCollectionRequest,
    StellaAddToCollectionResponse,
    StellaCommandExecuteRequest,
    StellaCommandExecuteResponse,
    StellaCommandListResponse,
    StellaCreateNoteCancelRequest,
    StellaCreateNoteCancelResponse,
    StellaCreateNoteCommitRequest,
    StellaCreateNoteCommitResponse,
    StellaCreateNoteDraftRequest,
    StellaCreateNoteDraftResponse,
    StellaInboxReviewResponse,
    StellaLinkNotesConnectRequest,
    StellaLinkNotesConnectResponse,
    StellaLinkNotesRequest,
    StellaLinkNotesResponse,
    StellaRecordMessageRequest,
    StellaSearchRequest,
    StellaSearchResponse,
    StellaSuggestionsResponse,
    StellaSummarizeRequest,
    StellaSummarizeResponse,
)
from app.services import stella_command_service

router = APIRouter(tags=["stella-commands"])


@router.get(
    "/workspaces/{workspace_id}/stella/suggestions",
    response_model=StellaSuggestionsResponse,
    status_code=status.HTTP_200_OK,
)
def get_stella_command_suggestions(
    workspace_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    command: Annotated[str, Query(description="Command identifier, e.g. /summarize")],
    q: Annotated[str, Query(description="Query filter for target items")] = "",
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
    arg_index: Annotated[int, Query(ge=0, le=5, description="Active argument index")] = 0,
) -> StellaSuggestionsResponse:
    """Return matching workspace items for argument-aware slash commands."""
    return stella_command_service.get_command_suggestions(
        db=db,
        workspace_id=workspace_id,
        command=command,
        query=q,
        limit=limit,
        arg_index=arg_index,
    )


@router.post(
    "/workspaces/{workspace_id}/stella/commands/summarize",
    response_model=StellaSummarizeResponse,
    status_code=status.HTTP_200_OK,
)
def summarize_target_item(
    workspace_id: uuid.UUID,
    body: StellaSummarizeRequest,
    db: Annotated[Session, Depends(get_db)],
) -> StellaSummarizeResponse:
    """Summarize a target item (note, source, collection, entity) using real content and return structured key points."""
    return stella_command_service.summarize_target(
        db=db,
        workspace_id=workspace_id,
        target=body.target,
        conversation_id=body.conversation_id,
        prompt=body.prompt,
    )


@router.get(
    "/workspaces/{workspace_id}/stella/commands",
    response_model=StellaCommandListResponse,
    status_code=status.HTTP_200_OK,
)
def list_stella_commands(
    workspace_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
) -> StellaCommandListResponse:
    """List available slash commands for Stella chat interface."""
    cmds = stella_command_service.list_commands()
    return StellaCommandListResponse(commands=cmds, total=len(cmds))


@router.post(
    "/workspaces/{workspace_id}/stella/commands/create-note/draft",
    response_model=StellaCreateNoteDraftResponse,
    status_code=status.HTTP_200_OK,
)
def generate_create_note_draft(
    workspace_id: uuid.UUID,
    body: StellaCreateNoteDraftRequest,
    db: Annotated[Session, Depends(get_db)],
) -> StellaCreateNoteDraftResponse:
    """Generate a ~300-word note draft on a topic and stage a 2-phase action proposal."""
    return stella_command_service.generate_note_draft(
        db=db,
        workspace_id=workspace_id,
        topic=body.topic,
        conversation_id=body.conversation_id,
        prompt=body.prompt,
    )


@router.post(
    "/workspaces/{workspace_id}/stella/commands/create-note/commit",
    response_model=StellaCreateNoteCommitResponse,
    status_code=status.HTTP_200_OK,
)
def commit_create_note_draft(
    workspace_id: uuid.UUID,
    body: StellaCreateNoteCommitRequest,
    db: Annotated[Session, Depends(get_db)],
) -> StellaCreateNoteCommitResponse:
    """Commit a staged note creation proposal into a persistent Note record."""
    return stella_command_service.commit_note_draft(
        db=db,
        workspace_id=workspace_id,
        proposal_id=body.proposal_id,
        confirmation_token=body.confirmation_token,
        title=body.title,
        content=body.content,
        conversation_id=body.conversation_id,
    )


@router.post(
    "/workspaces/{workspace_id}/stella/commands/create-note/cancel",
    response_model=StellaCreateNoteCancelResponse,
    status_code=status.HTTP_200_OK,
)
def cancel_create_note_draft(
    workspace_id: uuid.UUID,
    body: StellaCreateNoteCancelRequest,
    db: Annotated[Session, Depends(get_db)],
) -> StellaCreateNoteCancelResponse:
    """Cancel a staged note creation proposal."""
    stella_command_service.cancel_note_draft(
        db=db,
        workspace_id=workspace_id,
        proposal_id=body.proposal_id,
    )
    return StellaCreateNoteCancelResponse(
        status="cancelled",
        proposal_id=body.proposal_id,
    )


@router.post(
    "/workspaces/{workspace_id}/stella/commands/search",
    response_model=StellaSearchResponse,
    status_code=status.HTTP_200_OK,
)
def execute_stella_search(
    workspace_id: uuid.UUID,
    body: StellaSearchRequest,
    db: Annotated[Session, Depends(get_db)],
) -> StellaSearchResponse:
    """Execute multi-domain global search across notes, sources, entities, collections, threads."""
    return stella_command_service.execute_search(
        db=db,
        workspace_id=workspace_id,
        query=body.query,
        limit=body.limit,
        conversation_id=body.conversation_id,
        prompt=body.prompt,
    )


@router.get(
    "/workspaces/{workspace_id}/stella/commands/inbox",
    response_model=StellaInboxReviewResponse,
    status_code=status.HTTP_200_OK,
)
def review_stella_inbox(
    workspace_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    conversation_id: Annotated[uuid.UUID | None, Query(description="Optional conversation ID")] = None,
) -> StellaInboxReviewResponse:
    """Retrieve authoritative inbox review state using the workspace inbox service."""
    return stella_command_service.execute_inbox_review(
        db=db,
        workspace_id=workspace_id,
        conversation_id=conversation_id,
    )


@router.post(
    "/workspaces/{workspace_id}/stella/commands/add-to-collection/draft",
    response_model=StellaAddToCollectionResponse,
    status_code=status.HTTP_200_OK,
)
def generate_add_to_collection_draft(
    workspace_id: uuid.UUID,
    body: StellaAddToCollectionRequest,
    db: Annotated[Session, Depends(get_db)],
) -> StellaAddToCollectionResponse:
    """Stage a two-phase action proposal to add an item to a collection."""
    return stella_command_service.stage_add_to_collection(
        db=db,
        workspace_id=workspace_id,
        item_id=body.item_id,
        item_type=body.item_type,
        collection_id=body.collection_id,
        conversation_id=body.conversation_id,
        prompt=body.prompt,
    )


@router.post(
    "/workspaces/{workspace_id}/stella/commands/add-to-collection/commit",
    response_model=StellaAddToCollectionCommitResponse,
    status_code=status.HTTP_200_OK,
)
def commit_add_to_collection_draft(
    workspace_id: uuid.UUID,
    body: StellaAddToCollectionCommitRequest,
    db: Annotated[Session, Depends(get_db)],
) -> StellaAddToCollectionCommitResponse:
    """Commit a staged add-to-collection proposal into database membership records."""
    return stella_command_service.commit_add_to_collection(
        db=db,
        workspace_id=workspace_id,
        proposal_id=body.proposal_id,
        confirmation_token=body.confirmation_token,
        conversation_id=body.conversation_id,
    )


@router.post(
    "/workspaces/{workspace_id}/stella/commands/link-notes",
    response_model=StellaLinkNotesResponse,
    status_code=status.HTTP_200_OK,
)
def find_stella_note_links(
    workspace_id: uuid.UUID,
    body: StellaLinkNotesRequest,
    db: Annotated[Session, Depends(get_db)],
) -> StellaLinkNotesResponse:
    """Find potential connection candidates for a note using review service."""
    return stella_command_service.execute_link_notes(
        db=db,
        workspace_id=workspace_id,
        target=body.target,
        limit=body.limit,
        conversation_id=body.conversation_id,
        prompt=body.prompt,
    )


@router.post(
    "/workspaces/{workspace_id}/stella/commands/link-notes/connect",
    response_model=StellaLinkNotesConnectResponse,
    status_code=status.HTTP_200_OK,
)
def connect_stella_note_links(
    workspace_id: uuid.UUID,
    body: StellaLinkNotesConnectRequest,
    db: Annotated[Session, Depends(get_db)],
) -> StellaLinkNotesConnectResponse:
    """Establish a connection between two workspace notes."""
    return stella_command_service.connect_stella_note_link(
        db=db,
        workspace_id=workspace_id,
        source_note_id=body.source_note_id,
        target_note_id=body.target_note_id,
        conversation_id=body.conversation_id,
    )


@router.post(
    "/workspaces/{workspace_id}/stella/commands/execute",
    response_model=StellaCommandExecuteResponse,
    status_code=status.HTTP_200_OK,
)
def execute_stella_command(
    workspace_id: uuid.UUID,
    body: StellaCommandExecuteRequest,
    db: Annotated[Session, Depends(get_db)],
) -> StellaCommandExecuteResponse:
    """Execute or propose any Stella action/command using canonical domain services."""
    return stella_command_service.execute_stella_action_command(
        db=db,
        workspace_id=workspace_id,
        command=body.command,
        args=body.args,
        parameters=body.parameters,
        conversation_id=body.conversation_id,
        proposal_id=body.proposal_id,
        confirmation_token=body.confirmation_token,
        prompt=body.prompt,
    )


@router.post(
    "/workspaces/{workspace_id}/stella/conversations/{conversation_id}/messages",
    status_code=status.HTTP_201_CREATED,
)
def record_stella_message(
    workspace_id: uuid.UUID,
    conversation_id: uuid.UUID,
    body: StellaRecordMessageRequest,
    db: Annotated[Session, Depends(get_db)],
):
    """Persist a message (user or assistant) directly to the conversation history."""
    from app.services import message_service

    msg = message_service.create_message(
        db=db,
        conversation_id=conversation_id,
        role=body.role,
        content=body.content,
    )
    return {"id": str(msg.id), "status": "persisted"}


