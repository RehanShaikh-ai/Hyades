"""Stella slash command and in-chat action endpoints.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.stella_commands import (
    StellaCommandListResponse,
    StellaCreateNoteCancelRequest,
    StellaCreateNoteCancelResponse,
    StellaCreateNoteCommitRequest,
    StellaCreateNoteCommitResponse,
    StellaCreateNoteDraftRequest,
    StellaCreateNoteDraftResponse,
)
from app.services import stella_command_service

router = APIRouter(tags=["stella-commands"])


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
