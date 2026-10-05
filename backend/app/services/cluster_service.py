"""Cluster management service.

Canonical service per CONTRACT v0.3.2 §5.3, §9.6.
Clusters workspace notes and entities automatically into thematic groups.
"""

import logging
import uuid
from collections import defaultdict
from datetime import UTC, datetime

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import ClusterNotFoundError, WorkspaceNotFoundError
from app.models.entity_chunk import EntityChunk
from app.models.graph_entity import GraphEntity
from app.models.note import Note
from app.models.note_cluster import NoteCluster
from app.models.note_cluster_member import NoteClusterMember
from app.models.note_link import NoteLink
from app.models.workspace import Workspace

logger = logging.getLogger("app.services.cluster_service")


def cluster_workspace(db: Session, workspace_id: uuid.UUID) -> list[NoteCluster]:
    """Perform automatic clustering of workspace notes and entities per CONTRACT §8.1, §9.6.

    Idempotently replaces previous clusters for this workspace.
    Clusters represent real semantic knowledge topics derived from workspace notes and concepts.
    """
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise WorkspaceNotFoundError("Workspace not found.")

    # 1. Clean up existing clusters for workspace to guarantee idempotency & no stale duplicates
    existing_cluster_ids = list(
        db.scalars(select(NoteCluster.id).where(NoteCluster.workspace_id == workspace_id)).all()
    )
    if existing_cluster_ids:
        # Clear entity references
        db.execute(
            update(GraphEntity)
            .where(GraphEntity.workspace_id == workspace_id)
            .values(cluster_id=None)
        )
        # Delete cluster members
        db.execute(
            delete(NoteClusterMember).where(NoteClusterMember.cluster_id.in_(existing_cluster_ids))
        )
        # Delete clusters
        db.execute(delete(NoteCluster).where(NoteCluster.id.in_(existing_cluster_ids)))
        db.flush()
        db.expire_all()

    notes = db.scalars(
        select(Note)
        .where(Note.workspace_id == workspace_id, Note.is_archived.is_(False))
        .order_by(Note.title.asc())
    ).all()
    if not notes:
        db.commit()
        return []

    # Get entities for notes
    entity_chunks = db.scalars(
        select(EntityChunk).where(EntityChunk.workspace_id == workspace_id)
    ).all()

    note_entities: dict[uuid.UUID, set[uuid.UUID]] = defaultdict(set)
    for ec in entity_chunks:
        note_entities[ec.note_id].add(ec.entity_id)

    # Fetch all entities
    all_entities = db.scalars(
        select(GraphEntity).where(GraphEntity.workspace_id == workspace_id)
    ).all()
    entity_map = {e.id: e for e in all_entities}

    # Fetch explicit note links
    all_links = db.scalars(
        select(NoteLink).where(NoteLink.source_note_id.in_([n.id for n in notes]))
    ).all()
    linked_pairs: set[tuple[uuid.UUID, uuid.UUID]] = set()
    for link in all_links:
        linked_pairs.add((link.source_note_id, link.target_note_id))
        linked_pairs.add((link.target_note_id, link.source_note_id))

    # Thematic topic grouping:
    # Strongly connected notes group together; distinct knowledge domains maintain
    # their dedicated topic shelf.
    parent = {n.id: n.id for n in notes}

    def find_root(i: uuid.UUID) -> uuid.UUID:
        if parent[i] == i:
            return i
        parent[i] = find_root(parent[i])
        return parent[i]

    def union_nodes(i: uuid.UUID, j: uuid.UUID) -> None:
        ri, rj = find_root(i), find_root(j)
        if ri != rj:
            parent[ri] = rj

    for i in range(len(notes)):
        for j in range(i + 1, len(notes)):
            n1, n2 = notes[i], notes[j]
            e1, e2 = note_entities[n1.id], note_entities[n2.id]
            inter = len(e1 & e2)
            union_sz = len(e1 | e2)
            jaccard = inter / union_sz if union_sz > 0 else 0
            is_linked = (n1.id, n2.id) in linked_pairs

            if (is_linked and inter >= 2) or (inter >= 4 and jaccard >= 0.25):
                union_nodes(n1.id, n2.id)

    note_groups: dict[uuid.UUID, list[Note]] = defaultdict(list)
    for n in notes:
        note_groups[find_root(n.id)].append(n)

    created_clusters: list[NoteCluster] = []

    for _root_id, member_notes in note_groups.items():
        if len(member_notes) == 1:
            label = member_notes[0].title.strip()
            desc = f"Archival topic shelf for {label}"
        else:
            # Multi-note topic: order by entity count
            sorted_members = sorted(
                member_notes, key=lambda n: len(note_entities.get(n.id, set())), reverse=True
            )
            primary_note = sorted_members[0]
            label = primary_note.title.strip()
            other_titles = [m.title.strip() for m in sorted_members[1:]]
            desc = f"Topic cluster encompassing {primary_note.title} and {', '.join(other_titles)}"

        cluster = NoteCluster(
            workspace_id=workspace_id,
            label=label,
            description=desc,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        db.add(cluster)
        db.flush()

        for m_note in member_notes:
            member = NoteClusterMember(
                cluster_id=cluster.id,
                note_id=m_note.id,
                score=1.0,
            )
            db.add(member)

            # Assign cluster_id to all entities belonging to this member note
            for eid in note_entities.get(m_note.id, set()):
                ent = entity_map.get(eid)
                if ent and (ent.cluster_id is None or ent.cluster_id != cluster.id):
                    ent.cluster_id = cluster.id

        created_clusters.append(cluster)

    db.commit()
    for c in created_clusters:
        db.refresh(c)
    return created_clusters


def get_cluster(db: Session, cluster_id: uuid.UUID) -> NoteCluster:
    """Retrieve a cluster with its members per CONTRACT §9.6."""
    cluster = db.scalars(
        select(NoteCluster)
        .options(
            selectinload(NoteCluster.members).selectinload(NoteClusterMember.note),
            selectinload(NoteCluster.entities),
        )
        .where(NoteCluster.id == cluster_id)
    ).first()

    if not cluster:
        raise ClusterNotFoundError("Cluster not found.")
    return cluster


def list_clusters(db: Session, workspace_id: uuid.UUID) -> list[NoteCluster]:
    """List all clusters in a workspace per CONTRACT §9.6."""
    return db.scalars(
        select(NoteCluster)
        .options(selectinload(NoteCluster.members).selectinload(NoteClusterMember.note))
        .where(NoteCluster.workspace_id == workspace_id)
        .order_by(NoteCluster.created_at.desc())
    ).all()
