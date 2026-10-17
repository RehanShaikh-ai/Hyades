"""Idempotent seed script to populate development workspace with up to exactly 25 useful notes.

Adheres to Hyades Stabilization Sprint 1 Priority 5:
- Exactly 25 notes in the designated workspace.
- Varied, non-repetitive, substantive notes.
- Cluster 1: Local-first software & personal knowledge management (8 notes).
- Cluster 2: Learning systems, memory & cognitive tools (8 notes).
- Intersections: Bridges between local-first and cognition (4 notes).
- Diverse independent topics: Astronomy, urban architecture, typography, resilience (5 notes).
- Tagged with raw_metadata["seed"] = True.
- Safe: Never deletes existing user records. Adds only enough to reach 25 notes.
- Idempotent: Running multiple times does not produce duplicates.
"""

import argparse
import logging
import re
import sys
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.note import Note
from app.models.note_link import NoteLink
from app.models.tag import Tag
from app.models.user import User
from app.models.workspace import Workspace
from app.services import job_service, version_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger("seed_notes")

SEED_NOTES_CATALOG = [
    # Cluster 1: Local-First Software & PKM
    {
        "title": "Local-First Software Architecture",
        "tags": ["local-first", "architecture", "distributed-systems"],
        "content": """# Local-First Software Architecture

Local-first software represents a paradigm shift from traditional cloud-centric software architectures. In a local-first system, the primary copy of every artifact is stored locally on the user's device, giving users ownership, continuous availability, and near-zero latency operations.

Key Pillars:
1. **No Spinners:** All reads and writes occur instantly against local persistent storage (e.g. SQLite, OPFS).
2. **Multi-Device Synchronization:** Devices synchronize asynchronously via peer-to-peer protocols or relay servers when network connectivity is present.
3. **Conflict Resolution:** Divergent offline edits converge deterministically using [[Conflict-Free Replicated Data Types (CRDTs)]].
4. **Data Longevity:** The user retains raw file ownership independent of proprietary software vendor survival.

See also: [[Designing Offline-First Sync Engines]], [[Data Ownership and Long-Term Archival]].
""",
    },
    {
        "title": "Conflict-Free Replicated Data Types (CRDTs)",
        "tags": ["local-first", "algorithms", "crdt"],
        "content": """# Conflict-Free Replicated Data Types (CRDTs)

CRDTs provide mathematical convergence guarantees for distributed mutable data structures without requiring central coordination or distributed consensus locks.

Classes of CRDTs:
- **State-based (CvRDTs):** Replicas exchange full states and merge using monotonic semi-lattice join operations.
- **Operation-based (CmRDTs):** Replicas broadcast causal operations; requires causal delivery guarantees.
- **Sequence CRDTs for Text:** Structures such as RGA, Fugue, and Yjs represent editable text sequences, resolving concurrent insertions with relative position trees.

Applications in Knowledge Management:
- Seamless multi-device editing of research notes.
- Collaborative annotation of archival folios.
- Non-destructive merging of branching research hypotheses.

Intersects with: [[Local-First Software Architecture]], [[Designing Offline-First Sync Engines]].
""",
    },
    {
        "title": "Bidirectional Linking and Graph Topologies",
        "tags": ["pkm", "knowledge-graphs", "hypertext"],
        "content": """# Bidirectional Linking and Graph Topologies

Hierarchical folder trees force artificial categorization on multidimensional concepts. In contrast, bidirectional linking creates an associative knowledge graph that mirrors natural human cognition.

Principles:
- **Associative Indexing:** Originating with Vannevar Bush's Memex and Ted Nelson's Project Xanadu, links preserve provenance in both forward and backward directions.
- **Unlinked Mentions:** Graph crawlers discover implicit relationships across notes by identifying lexical matches.
- **Small-World Graph Metrics:** Real research graphs exhibit high clustering coefficients and short path lengths between disparate domains.

Connected notes: [[Incremental Knowledge Gardening]], [[Augmenting Human Intellect via Augmented Trails]].
""",
    },
    {
        "title": "Incremental Knowledge Gardening",
        "tags": ["pkm", "workflows", "zettelkasten"],
        "content": """# Incremental Knowledge Gardening

Knowledge work is an organic, iterative process of cultivation rather than a factory assembly line. 

Phases of the Garden:
1. **Seedlings:** Raw fleeting notes, captured quotations, or initial questions.
2. **Budding Ideas:** Notes synthesized with initial links and personal context.
3. **Evergreen Notes:** Atomic, self-contained concepts written in declarative prose with stable identifiers.

Best Practices:
- Prefer atomic notes that address a single focused idea.
- Regularly prune stale assumptions and strengthen associative bridges.
- Avoid premature structuring; let clusters emerge naturally from dense linking.

Related: [[Zettelkasten Method and Fleeting Notes]], [[Bidirectional Linking and Graph Topologies]].
""",
    },
    {
        "title": "Vector Embeddings for Spatial Navigation",
        "tags": ["embeddings", "vector-search", "spatial-ui"],
        "content": """# Vector Embeddings for Spatial Navigation

Dense vector embeddings map text documents into high-dimensional semantic spaces where geometric proximity reflects conceptual similarity.

Dimensional Properties:
- Cosine similarity measures directional alignment regardless of vector magnitude.
- Dimensionality reduction algorithms (UMAP, t-SNE) project high-dimensional embeddings onto 2D or 3D manifolds.
- Approximate Nearest Neighbor (ANN) indexes like HNSW enable sub-millisecond retrieval across tens of thousands of chunks.

In Hyades, embeddings power both hybrid semantic search and celestial coordinate generation in the Observatory.

See also: [[Spatial Memory and Visual Knowledge Topologies]], [[Data Ownership and Long-Term Archival]].
""",
    },
    {
        "title": "Data Ownership and Long-Term Archival",
        "tags": ["local-first", "archival", "privacy"],
        "content": """# Data Ownership and Long-Term Archival

The average lifespan of a web-based SaaS service is significantly shorter than a scholar's career. Preserving research archives requires resilient file storage.

Archival Standards:
- **Plain Text First:** Markdown with YAML frontmatter guarantees human readability across decades.
- **Deterministic Checksums:** SHA-256 content hashes verify cryptographic integrity and guard against silent bit rot.
- **Zero Vendor Lock-in:** Open specifications ensure notes can be inspected with standard shell utilities (`grep`, `rg`, `git`).

References: [[Local-First Software Architecture]], [[Checklist: Vault Resilience and Recovery Protocol]].
""",
    },
    {
        "title": "Designing Offline-First Sync Engines",
        "tags": ["local-first", "engineering", "offline"],
        "content": """# Designing Offline-First Sync Engines

Engineering an offline-first synchronization engine requires handling partial failures, offline write queues, and eventual consistency.

Key Components:
- **Mutation Log:** An append-only local log tracking uncommitted client modifications.
- **Sync Transport:** Resilient HTTP or WebSocket batch streaming with exponential backoff and jitter.
- **Tombstones:** Soft deletions recorded with timestamps to prevent deleted entities from resurrecting during peer sync.

Related architectures: [[Local-First Software Architecture]], [[Conflict-Free Replicated Data Types (CRDTs)]].
""",
    },
    {
        "title": "Federated Identity and P2P Replication",
        "tags": ["local-first", "cryptography", "security"],
        "content": """# Federated Identity and P2P Replication

Decentralized collaborative research requires identities that do not depend on third-party auth providers.

Mechanisms:
- **Public-Key Cryptography:** Ed25519 signing keys authenticate note revisions and prove author provenance.
- **Gossip Protocols:** Devices discover peers over local Wi-Fi via mDNS and exchange sync vectors directly.
- **Capability-Based Access Control:** Cryptographic tokens define read/write permissions for shared collections.

Links: [[Local-First Software Architecture]], [[Data Ownership and Long-Term Archival]].
""",
    },
    # Cluster 2: Learning Systems, Memory, and Cognitive Tools
    {
        "title": "Spaced Repetition and the Forgetting Curve",
        "tags": ["cognitive-science", "memory", "learning"],
        "content": """# Spaced Repetition and the Forgetting Curve

Hermann Ebbinghaus discovered that memory retention decays exponentially over time in the absence of active review.

Key Insights:
- **The Spacing Effect:** Reviewing material at increasing time intervals resets the forgetting curve and flattens its slope.
- **Modern Algorithms:** The FSRS (Free Spaced Repetition Scheduler) and SM-2 algorithms compute optimal review intervals based on difficulty and retrievability.
- **Desirable Difficulty:** Retrieving a concept just as it is about to be forgotten produces the strongest neural encoding.

Intersects with: [[The Generation Effect in Active Recall]], [[Algorithmic Spaced Retrieval from Local Graphs]].
""",
    },
    {
        "title": "Dual Coding Theory and Multimodal Retrieval",
        "tags": ["cognitive-science", "multimodal", "learning"],
        "content": """# Dual Coding Theory and Multimodal Retrieval

Allan Paivio's Dual Coding Theory posits that the human mind processes information through two separate but interacting subsystems: nonverbal (structural/spatial) and verbal (linguistic).

Implications for Research Tools:
- Textual summaries combined with spatial celestial charts activate both verbal and visuospatial cognitive subsystems.
- Spatial layout provides strong associative cues that enhance recall during exploratory browsing.

See also: [[Spatial Memory and Visual Knowledge Topologies]], [[Cognitive Load Theory in Interface Design]].
""",
    },
    {
        "title": "The Generation Effect in Active Recall",
        "tags": ["cognitive-science", "memory", "learning"],
        "content": """# The Generation Effect in Active Recall

Experimental psychology demonstrates that generating an answer or explanation from memory produces significantly higher retention than passive rereading.

Applications:
- **Inquiry-Driven Reading:** Formulate guiding research questions before reading a source document.
- **Cloze Deletions:** Synthesize definitions into active recall prompts.
- **Thread Discoveries:** Actively log breakthrough insights as explicit discovery nodes.

Related: [[Spaced Repetition and the Forgetting Curve]], [[Metacognitive Scaffolding in Digital Notebooks]].
""",
    },
    {
        "title": "Cognitive Load Theory in Interface Design",
        "tags": ["ui-engineering", "cognitive-science", "design"],
        "content": """# Cognitive Load Theory in Interface Design

John Sweller's Cognitive Load Theory categorizes mental effort into three distinct channels:
1. **Intrinsic Load:** The inherent difficulty of the topic being studied.
2. **Germane Load:** The productive effort dedicated to schema construction and deep processing.
3. **Extraneous Load:** Wasted mental bandwidth caused by poor visual hierarchy, clutter, or jarring UI controls.

The Ivory Observatory design language minimizes extraneous load through restrained palettes, clear typographic hierarchy, and tactile physical metaphors.

Connected to: [[Typography and Legibility in Editorial Systems]], [[Dual Coding Theory and Multimodal Retrieval]].
""",
    },
    {
        "title": "Zettelkasten Method and Fleeting Notes",
        "tags": ["pkm", "zettelkasten", "learning"],
        "content": """# Zettelkasten Method and Fleeting Notes

Niklas Luhmann's Zettelkasten (slip-box) enabled the generation of over 70 books and hundreds of scholarly articles through emergent conceptual linking.

Note Hierarchy:
- **Fleeting Notes:** Quick captures to be processed within 24 hours.
- **Literature Notes:** Summaries of external sources written in one's own words with bibliographic citations.
- **Permanent Notes:** Atomic ideas added into the slip-box with explicit references to predecessor and successor slips.

See also: [[Incremental Knowledge Gardening]], [[The Generation Effect in Active Recall]].
""",
    },
    {
        "title": "Conceptual Synthesis and Analogical Transfer",
        "tags": ["cognitive-science", "creativity", "synthesis"],
        "content": """# Conceptual Synthesis and Analogical Transfer

Analogical transfer occurs when a cognitive schema from a known source domain is mapped onto a novel target domain.

Mechanisms:
- **Surface vs Structural Similarities:** Novices attend to surface details; experts identify deep structural isomorphisms.
- **Cross-Domain Discovery:** Connecting distributed systems concepts (CRDTs) to biological memory models yields novel architectural insights.

Links: [[Bidirectional Linking and Graph Topologies]], [[Augmenting Human Intellect via Augmented Trails]].
""",
    },
    {
        "title": "Metacognitive Scaffolding in Digital Notebooks",
        "tags": ["cognitive-science", "metacognition", "learning"],
        "content": """# Metacognitive Scaffolding in Digital Notebooks

Metacognition is the awareness and regulation of one's own learning processes. Digital research environments should provide active scaffolding.

Scaffolding Features:
- Guiding questions that orient open-ended research threads.
- Explicit status tracking for unresolved research anomalies.
- Reflection prompts that summarize findings across multiple sources.

Connected notes: [[The Generation Effect in Active Recall]], [[Zettelkasten Method and Fleeting Notes]].
""",
    },
    {
        "title": "Deliberate Practice and Chunking in Skill Acquisition",
        "tags": ["cognitive-science", "learning", "expertise"],
        "content": """# Deliberate Practice and Chunking in Skill Acquisition

Anders Ericsson's research on deliberate practice demonstrates that expertise requires focused, goal-directed repetition with immediate feedback loops.

Role of Chunking:
- Working memory can hold only 4-7 independent items.
- Experts group related concepts into higher-order "chunks", dramatically expanding effective cognitive bandwidth.
- Synthesized research notes serve as externalized cognitive chunks.

Related: [[Cognitive Load Theory in Interface Design]], [[Spaced Repetition and the Forgetting Curve]].
""",
    },
    # Bridges & Intersections between Cluster 1 and Cluster 2
    {
        "title": "Algorithmic Spaced Retrieval from Local Graphs",
        "tags": ["synthesis", "local-first", "memory"],
        "content": """# Algorithmic Spaced Retrieval from Local Graphs

Bridging local-first note storage with spaced repetition algorithms creates a self-reinforcing learning loop.

Synthesis:
- By analyzing the topology of a user's local notes graph, Hyades can prioritize forgotten concepts at risk of memory decay.
- Nodes with few incoming links but high centrality are surfaced for targeted active recall.

Combines: [[Local-First Software Architecture]] and [[Spaced Repetition and the Forgetting Curve]].
""",
    },
    {
        "title": "Spatial Memory and Visual Knowledge Topologies",
        "tags": ["synthesis", "spatial-ui", "memory"],
        "content": """# Spatial Memory and Visual Knowledge Topologies

Human evolutionary memory is deeply spatial. We remember *where* an object or landmark is located with remarkable fidelity (the Method of Loci).

Observation in Hyades:
- Mapping vector embeddings onto 2D celestial sky charts allows researchers to navigate abstract intellectual domains using spatial orientation instincts.
- Dense star clusters correspond to well-trodden research domains; isolated nebulae represent emerging curiosities.

Integrates: [[Vector Embeddings for Spatial Navigation]] with [[Dual Coding Theory and Multimodal Retrieval]].
""",
    },
    {
        "title": "Augmenting Human Intellect via Augmented Trails",
        "tags": ["synthesis", "hypertext", "cognition"],
        "content": """# Augmenting Human Intellect via Augmented Trails

In 1962, Douglas Engelbart outlined a vision for augmenting human intellect by creating tools that amplify our problem-solving capabilities.

Core Tenet:
- Associative trails through research literature enable thinkers to follow complex trains of thought across days, weeks, and years without cognitive loss.
- Software should act as an intellectual bicycle, reducing the friction of exploration.

Synthesizes: [[Bidirectional Linking and Graph Topologies]] with [[Conceptual Synthesis and Analogical Transfer]].
""",
    },
    {
        "title": "Personal Second Brains as Cognitive Prosthetics",
        "tags": ["synthesis", "pkm", "cognition"],
        "content": """# Personal Second Brains as Cognitive Prosthetics

A personal second brain is not merely an archive; it is an active external cognitive prosthetic.

Key Functions:
- **Offloading Working Memory:** Storing references and citations so biological attention can focus on deep synthesis.
- **Serendipity Engine:** Surfacing unexpected connections between notes written months apart.
- **Local Sovereignty:** Keeping sensitive personal reflections private and secure on local hardware.

See also: [[Local-First Software Architecture]], [[Metacognitive Scaffolding in Digital Notebooks]].
""",
    },
    # Diverse Independent Research Notes
    {
        "title": "Keplerian Orbital Harmonics and Celestial Mechanics",
        "tags": ["astronomy", "physics", "history-of-science"],
        "content": """# Keplerian Orbital Harmonics and Celestial Mechanics

Johannes Kepler's 1619 work *Harmonices Mundi* attempted to explain planetary motion through geometric and musical harmonies.

Kepler's Laws:
1. **The Law of Ellipses:** The orbit of a planet is an ellipse with the Sun at one of the two foci.
2. **The Law of Equal Areas:** A line segment joining a planet and the Sun sweeps out equal areas during equal intervals of time.
3. **The Law of Harmonies:** The square of the orbital period of a planet is directly proportional to the cube of the semi-major axis of its orbit ($P^2 \\propto a^3$).

This astronomical heritage directly informs the naming, celestial aesthetic, and astronomical coordinates in the Hyades Observatory.
""",
    },
    {
        "title": "Microclimate Engineering in Urban Architecture",
        "tags": ["architecture", "urbanism", "sustainability"],
        "content": """# Microclimate Engineering in Urban Architecture

Passive architectural design can significantly lower thermal stress in urban density without mechanical air conditioning.

Strategies:
- **Wind Catcher Towers (Badgirs):** Traditional Persian cooling towers that channel ambient breezes downward through evaporative water basins.
- **Thermal Mass Buffering:** Heavy stone and rammed earth walls that absorb peak diurnal solar radiation and release warmth slowly during cool nights.
- **Biophilic Shade Canopies:** Deciduous tree canopies that block summer sun while allowing winter light to penetrate building facades.
""",
    },
    {
        "title": "Typography and Legibility in Editorial Systems",
        "tags": ["typography", "editorial", "design"],
        "content": """# Typography and Legibility in Editorial Systems

Long-form research reading requires deliberate typographic rhythm, proportions, and optical calibration.

Design Principles:
- **Measure and Leading:** Optimal line lengths range between 55 to 75 characters per line, paired with 1.4 to 1.6 relative line height.
- **Serif Proportions:** Newsreader and classical transitional serifs provide subtle horizontal baseline continuity that guides the reader's eye across sustained paragraphs.
- **Warm Contrast:** Soft charcoal ink (`#1A1714`) set against warm ivory parchment (`#FAF8F2`) eliminates the harsh ocular fatigue caused by pure black on glaring white.
""",
    },
    {
        "title": "Checklist: Vault Resilience and Recovery Protocol",
        "tags": ["resilience", "devops", "backup"],
        "content": """# Checklist: Vault Resilience and Recovery Protocol

Operational protocol for ensuring research vault data integrity:

- [x] Automated hourly snapshot of local PostgreSQL database via `pg_dump -Fc`.
- [x] Mirroring persistent markdown storage to secondary local cold storage disk.
- [x] Cryptographic verification of content hashes across all ingested sources.
- [x] Periodic offline restoration drill into an isolated temporary database container.
- [x] Zero network dependency: confirm all core reading and search workflows execute cleanly in airplane mode.
""",
    },
    {
        "title": "Foundations of Archival Taxonomy and Folio Cataloging",
        "tags": ["archival", "library-science", "history"],
        "content": """# Foundations of Archival Taxonomy and Folio Cataloging

Classical libraries structured knowledge through provenance, physical folio bindings, and catalog indices.

Core Principles:
- **Respect des Fonds:** Preserving the original grouping and arrangement of records from their creating entity.
- **Principle of Original Order:** Maintaining the sequence in which documents were gathered and used during their working life.
- **Folio Call Numbers:** Structured physical identifiers that ground abstract digital texts in specific historical editions.
""",
    },
]


def seed_workspace_notes(
    db: Session,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID | None = None,
    target_count: int = 25,
) -> int:
    """Idempotently seed notes into workspace up to target_count."""
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise ValueError(f"Workspace {workspace_id} not found.")

    if not user_id:
        user_id = ws.owner_id
        if not user_id:
            first_user = db.scalars(select(User)).first()
            if not first_user:
                raise ValueError("No user found in database to author notes.")
            user_id = first_user.id

    # Check current notes
    existing_notes = list(db.scalars(select(Note).where(Note.workspace_id == workspace_id)).all())
    existing_count = len(existing_notes)
    existing_titles = {n.title.strip().lower() for n in existing_notes}
    logger.info("Workspace '%s' (%s) starting note count: %d", ws.name, ws.id, existing_count)

    if existing_count >= target_count:
        logger.info(
            "Workspace already has %d notes (target: %d). No notes added.",
            existing_count,
            target_count,
        )
        return existing_count

    needed = target_count - existing_count
    logger.info("Adding %d seed notes to reach target %d...", needed, target_count)

    # Filter catalog items not already in workspace
    candidates = [
        item for item in SEED_NOTES_CATALOG if item["title"].strip().lower() not in existing_titles
    ]

    selected = candidates[:needed]
    created_notes: list[Note] = []

    # Cache tags
    tag_cache: dict[str, Tag] = {}
    existing_tags = list(db.scalars(select(Tag).where(Tag.workspace_id == workspace_id)).all())
    for t in existing_tags:
        tag_cache[t.name.lower()] = t

    for item in selected:
        note_id = uuid.uuid4()
        raw_meta = {
            "seed": True,
            "seed_version": "v0.4.2-sprint1",
            "seed_tags": item["tags"],
        }
        note = Note(
            id=note_id,
            workspace_id=workspace_id,
            title=item["title"],
            content=item["content"],
            created_by=user_id,
            metadata_=raw_meta,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

        # Attach tags
        for tag_name in item["tags"]:
            tag_slug = tag_name.strip().lower()
            if tag_slug not in tag_cache:
                new_tag = Tag(
                    id=uuid.uuid4(),
                    workspace_id=workspace_id,
                    name=tag_slug,
                )
                db.add(new_tag)
                db.flush()
                tag_cache[tag_slug] = new_tag
            note.tags.append(tag_cache[tag_slug])

        db.add(note)
        created_notes.append(note)

    db.commit()

    # Create initial version snapshots and index jobs
    for n in created_notes:
        db.refresh(n)
        try:
            version_service.create_version(
                db=db,
                workspace_id=n.workspace_id,
                note_id=n.id,
                author_id=n.created_by,
                message=f"Seed version: {n.title}",
            )
            job_service.enqueue_index_job(db, n.workspace_id, note_ids=[n.id])
        except Exception as e:
            logger.debug("Non-critical versioning error for seed note %s: %s", n.id, e)

    # Resolve wiki-links into NoteLink records between notes
    all_notes = list(db.scalars(select(Note).where(Note.workspace_id == workspace_id)).all())
    note_by_title = {n.title.strip().lower(): n for n in all_notes}

    wiki_link_pattern = re.compile(r"\[\[(.*?)\]\]")
    for n in created_notes:
        matches = wiki_link_pattern.findall(n.content)
        for target_title in matches:
            clean_target = target_title.strip().lower()
            if clean_target in note_by_title:
                target_note = note_by_title[clean_target]
                if target_note.id != n.id:
                    # Check if link exists
                    existing_link = db.get(NoteLink, (n.id, target_note.id))
                    if not existing_link:
                        link = NoteLink(source_note_id=n.id, target_note_id=target_note.id)
                        db.add(link)

    db.commit()

    final_count = (
        db.scalar(select(func.count(Note.id)).where(Note.workspace_id == workspace_id)) or 0
    )
    logger.info("Successfully seeded workspace. Final note count: %d", final_count)
    return final_count


def main():
    parser = argparse.ArgumentParser(
        description="Seed development workspace notes up to exactly 25."
    )
    parser.add_argument("--workspace-id", type=str, help="Workspace UUID to seed.")
    parser.add_argument("--target-count", type=int, default=25, help="Target total note count.")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if args.workspace_id:
            ws_id = uuid.UUID(args.workspace_id)
        else:
            ws = db.scalars(select(Workspace).order_by(Workspace.created_at.asc())).first()
            if not ws:
                logger.error("No workspace found in database.")
                sys.exit(1)
            ws_id = ws.id

        seed_workspace_notes(db, ws_id, target_count=args.target_count)
    finally:
        db.close()


if __name__ == "__main__":
    main()
