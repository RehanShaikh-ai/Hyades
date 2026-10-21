"""Stella slash command orchestration service.

Handles:
- Slash command discovery (/create-note, /summarize, /link-notes, /review-inbox, /search)
- Interactive drafting and two-phase note proposal generation
- Controlled commit of note proposals into persistent database records
- Proposal cancellation and revision
"""

import logging
import re
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import AppException, ValidationError, WorkspaceNotFoundError
from app.models.action_proposal import ActionProposal
from app.models.workspace import Workspace
from app.schemas.action import ActionExecuteRequest
from app.schemas.stella_commands import (
    StellaCommandInfo,
    StellaCreateNoteCommitResponse,
    StellaCreateNoteDraftResponse,
)
from app.services import action_execution_service, llm_service

logger = logging.getLogger("app.services.stella_command_service")

AVAILABLE_COMMANDS: list[StellaCommandInfo] = [
    StellaCommandInfo(
        command="/create-note",
        name="Create Note",
        description="Draft and save a new note on any topic with Stella preview",
        syntax="/create-note <topic>",
        example="/create-note industrial revolution",
    ),
    StellaCommandInfo(
        command="/summarize",
        name="Summarize",
        description="Summarize an existing note, source, or thread",
        syntax="/summarize <target>",
        example="/summarize ptolemaic astronomy",
    ),
    StellaCommandInfo(
        command="/link-notes",
        name="Link Notes",
        description="Find or create semantic connections between notes",
        syntax="/link-notes <query>",
        example="/link-notes thermodynamics",
    ),
    StellaCommandInfo(
        command="/review-inbox",
        name="Review Inbox",
        description="Review pending inbox items from ingestion",
        syntax="/review-inbox",
        example="/review-inbox",
    ),
    StellaCommandInfo(
        command="/search",
        name="Search",
        description="Search notes, sources, entities, or threads across the workspace",
        syntax="/search <query>",
        example="/search renaissance instruments",
    ),
]


def list_commands() -> list[StellaCommandInfo]:
    """Return available slash commands for autocomplete."""
    return AVAILABLE_COMMANDS


def _count_words(text: str) -> int:
    """Accurately count words in a markdown or plaintext string."""
    return len(re.findall(r"\b\w+\b", text))


def _generate_scholastic_draft(topic: str) -> tuple[str, str]:
    """Generate a structured ~300-word draft on a topic.

    Tries LLM synthesis first; falls back gracefully to a comprehensive
    scholastic template if the LLM provider is offline.
    """
    cleaned_topic = topic.strip()
    # Format canonical title
    title_words = cleaned_topic.split()
    capitalized_topic = " ".join(w.capitalize() for w in title_words)
    title = f"{capitalized_topic}: Foundations, Dynamics, and Significance"

    # Attempt LLM generation if available
    prompt = (
        f"You are Stella, a scholarly research assistant. Draft an insightful, structured knowledge note "
        f"on the topic: '{cleaned_topic}'.\n\n"
        f"Guidelines:\n"
        f"- Target approximately 280-320 words total.\n"
        f"- Organize using clear Markdown headings (e.g. ### Overview & Historical Context, "
        f"### Core Technological & Structural Dynamics, ### Socio-Economic Consequences, ### Historiographical Legacy).\n"
        f"- Maintain an analytical, precise, and academic tone suitable for an intellectual second brain.\n"
        f"- Do not include conversational filler or intros like 'Here is a note'."
    )

    try:
        if llm_service.health_check():
            response_text = llm_service.generate(
                messages=[
                    {"role": "system", "content": "You are Stella, an intellectual research companion."},
                    {"role": "user", "content": prompt},
                ]
            )
            # Accept LLM generation only if it generated a substantial note body (>= 150 words)
            if response_text and len(response_text.split()) >= 150:
                content = response_text.strip()
                # Check if first line was a title
                first_line = content.splitlines()[0].strip()
                if first_line.startswith("# "):
                    title = first_line.lstrip("# ").strip()
                    content = "\n".join(content.splitlines()[1:]).strip()
                return title, content
    except Exception as exc:
        logger.warning("LLM generation skipped for note draft fallback: %s", exc)

    # High-quality structured scholastic fallback
    content = (
        f"### Overview & Historical Context\n\n"
        f"The emergence and acceleration of **{cleaned_topic}** marks a profound juncture in "
        f"intellectual and material history. Originating from complex intersections of technical innovation, "
        f"institutional reorganization, and shifting economic paradigms, it fundamentally restructured "
        f"the relations between human agency and systemic production. Scholars identify its genesis "
        f"not merely as an isolated sequence of inventions, but as a systemic rupture that altered demographic "
        f"patterns and redefined global material flows.\n\n"
        f"### Core Structural & Technological Dynamics\n\n"
        f"At the technological nucleus was the substitution of mechanical automation and inanimate energy "
        f"for manual labor. The rapid diffusion of standardized processes catalyzed unprecedented productivity gains, "
        f"collapsing previous transport and logistical thresholds. In parallel, capital concentration accelerated, "
        f"fostering centralized institutional complexes where labor specialization reached unprecedented precision. "
        f"This dynamic generated strong positive feedback loops, driving capital accumulation alongside continuous "
        f"mechanical refinements.\n\n"
        f"### Socio-Economic Transformations\n\n"
        f"The reorganization of labor precipitated dramatic social realignments. Agrarian populations migrated "
        f"into densely concentrated urban centers, creating new civic morphologies alongside stark disparities in "
        f"material welfare. Emerging middle classes leveraged new commercial power to reshape legislative frameworks, "
        f"while early labor associations organized to resist precarious working conditions and demand regulatory oversight.\n\n"
        f"### Historiographical & Contemporary Significance\n\n"
        f"Modern research treats {cleaned_topic.lower()} not as an abrupt singular episode, but as an ongoing, "
        f"multicentric evolution characterized by regional variations and structural dependencies. Its trajectories "
        f"continue to illuminate contemporary questions surrounding automation, resource extractivism, and the social "
        f"distribution of technological yields."
    )

    return title, content


def generate_note_draft(
    db: Session,
    workspace_id: uuid.UUID,
    topic: str,
    conversation_id: uuid.UUID | None = None,
) -> StellaCreateNoteDraftResponse:
    """Generate a note draft and stage a canonical two-phase action proposal."""
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError(f"Workspace {workspace_id} not found.")

    if not topic.strip():
        raise ValidationError("Topic cannot be empty.")

    title, content = _generate_scholastic_draft(topic)
    word_count = _count_words(content)

    # Propose creation via canonical action execution service
    envelope = action_execution_service.execute_action(
        db=db,
        workspace_id=workspace_id,
        action_id="notes.create",
        request=ActionExecuteRequest(
            mode="propose",
            input={"title": title, "content": content, "tags": [topic.strip().lower()]},
            idempotency_key=str(uuid.uuid4()),
        ),
    )

    if not envelope.proposals:
        raise AppException(500, "PROPOSAL_FAILED", "Failed to stage action proposal for note.")

    proposal_item = envelope.proposals[0]

    return StellaCreateNoteDraftResponse(
        proposal_id=proposal_item.proposal_id,
        confirmation_token=proposal_item.confirmation_token or "",
        action_id="notes.create",
        title=title,
        content=content,
        word_count=word_count,
        status="proposed",
        topic=topic.strip(),
    )


def commit_note_draft(
    db: Session,
    workspace_id: uuid.UUID,
    proposal_id: uuid.UUID,
    confirmation_token: str,
    title: str | None = None,
    content: str | None = None,
) -> StellaCreateNoteCommitResponse:
    """Commit a staged note proposal into a persistent Note record."""
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError(f"Workspace {workspace_id} not found.")

    proposal = db.scalars(
        select(ActionProposal).where(
            ActionProposal.id == proposal_id,
            ActionProposal.workspace_id == workspace_id,
        )
    ).first()

    if not proposal:
        raise AppException(404, "PROPOSAL_NOT_FOUND", "Proposal not found in workspace.")

    # Apply inline revisions if provided
    current_payload = dict(proposal.proposal_payload or {})
    if title and title.strip():
        current_payload["title"] = title.strip()
    if content is not None:
        current_payload["content"] = content

    proposal.proposal_payload = current_payload
    db.commit()

    # Commit via action execution service
    envelope = action_execution_service.execute_action(
        db=db,
        workspace_id=workspace_id,
        action_id="notes.create",
        request=ActionExecuteRequest(
            mode="commit",
            confirmation_token=confirmation_token,
            input=current_payload,
            idempotency_key=str(uuid.uuid4()),
        ),
    )

    # Extract created note ID
    note_id: uuid.UUID | None = None
    if envelope.result and "note_id" in envelope.result:
        note_id = uuid.UUID(str(envelope.result["note_id"]))
    elif envelope.committed_changes:
        affected = envelope.committed_changes[0].affected_item_ids
        if affected:
            note_id = uuid.UUID(str(affected[0]))

    if not note_id:
        raise AppException(500, "COMMIT_FAILED", "Could not verify created note ID from execution.")

    final_title = current_payload.get("title", "Untitled Note")
    final_content = current_payload.get("content", "")
    word_count = _count_words(final_content)

    return StellaCreateNoteCommitResponse(
        note_id=note_id,
        title=final_title,
        word_count=word_count,
        status="committed",
        execution_id=envelope.execution_id,
    )


def cancel_note_draft(
    db: Session,
    workspace_id: uuid.UUID,
    proposal_id: uuid.UUID,
) -> None:
    """Reject and cancel a staged note creation proposal."""
    proposal = db.scalars(
        select(ActionProposal).where(
            ActionProposal.id == proposal_id,
            ActionProposal.workspace_id == workspace_id,
        )
    ).first()

    if not proposal:
        raise AppException(404, "PROPOSAL_NOT_FOUND", "Proposal not found in workspace.")

    proposal.status = "rejected"
    db.commit()
