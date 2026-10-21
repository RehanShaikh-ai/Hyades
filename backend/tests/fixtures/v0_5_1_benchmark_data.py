"""Reproducible benchmark fixture generator for Hyades v0.5.1 (§11.3, §11.4).

Generates deterministic fixture dataset:
- 100 notes
- 20 sources with chunks
- Fixed seed (42)
- Fixed benchmark queries
- Golden questions and expected evidence IDs
"""

import random
import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models import (
    ContentChunk,
    Note,
    Source,
    User,
    Workspace,
)

SEED = 42

DOMAINS = [
    "Stellar Evolution",
    "Observational Spectroscopy",
    "Exoplanet Detection",
    "Gravitational Dynamics",
    "Adaptive Optics",
    "Cosmological Expansion",
    "Interstellar Medium",
    "Compact Objects",
    "Radio Astronomy",
    "Astrophotometry",
]

BENCHMARK_QUERIES = [
    "stellar nucleosynthesis main sequence lifecycle",
    "doppler radial velocity exoplanet transit",
    "high resolution spectroscopy absorption lines",
    "wavefront deformable mirror atmospheric distortion",
    "hubble parameter expansion dark energy",
]


def create_reproducible_benchmark_dataset(
    db: Session,
    workspace_name: str = "Benchmark Workspace",
) -> tuple[Workspace, User, list[Note], list[Source]]:
    """Seed a reproducible fixture containing 100 notes and 20 sources with deterministic UUIDs."""
    rng = random.Random(SEED)

    # 1. User & Workspace
    user = User(
        id=uuid.UUID(bytes=rng.randbytes(16)),
        display_name="Benchmark Astronomer",
    )
    db.add(user)
    db.flush()

    workspace = Workspace(
        id=uuid.UUID(bytes=rng.randbytes(16)),
        name=workspace_name,
        owner_id=user.id,
    )
    db.add(workspace)
    db.flush()

    notes: list[Note] = []
    sources: list[Source] = []

    # 2. 100 Deterministic Notes
    for i in range(1, 101):
        domain = DOMAINS[(i - 1) % len(DOMAINS)]
        note_id = uuid.UUID(bytes=rng.randbytes(16))
        note = Note(
            id=note_id,
            workspace_id=workspace.id,
            created_by=user.id,
            title=f"{domain} Research Note #{i:03d}",
            content=(
                f"# {domain} Analysis #{i}\n\n"
                f"This note examines core principles of {domain}. "
                f"Observation cycle {i * 137 % 500}. "
                f"Parameters include flux intensity {rng.uniform(0.1, 9.9):.3f} and wavelength {380 + (i * 7) % 400} nm. "
                f"Significance established through rigorous multi-band photometry."
            ),
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        db.add(note)
        notes.append(note)

    # 3. 20 Deterministic Sources with ContentChunks
    for s_idx in range(1, 21):
        domain = DOMAINS[(s_idx - 1) % len(DOMAINS)]
        source_id = uuid.UUID(bytes=rng.randbytes(16))
        batch_id = uuid.UUID(bytes=rng.randbytes(16))
        path = f"/data/{domain.lower()}/compendium_{s_idx:02d}.md"
        source = Source(
            id=source_id,
            workspace_id=workspace.id,
            source_type="markdown",
            original_path=path,
            source_identifier=path,
            content_hash=f"{s_idx:064x}",
            import_batch_id=batch_id,
            import_status="completed",
            raw_metadata={"title": f"{domain} Reference Compendium Vol. {s_idx}"},
            file_size_bytes=1024 * s_idx * 15,
            processing_status="READY",
            processing_stage="complete",
            chunk_count=3,
            imported_at=datetime.now(UTC),
        )
        db.add(source)
        sources.append(source)

        # Add 3 chunks per source
        for c_idx in range(3):
            chunk_id = uuid.UUID(bytes=rng.randbytes(16))
            chunk = ContentChunk(
                id=chunk_id,
                workspace_id=workspace.id,
                source_id=source.id,
                chunk_index=c_idx,
                content=(
                    f"Chunk {c_idx} of {domain} Vol. {s_idx}. Key evidence concerning {domain}. "
                    f"Detailed observational measurements confirm spectral profile correlation {rng.uniform(0.85, 0.99):.3f}."
                ),
                content_hash=f"hash_{s_idx}_{c_idx}",
                token_count=120,
                embedding_model="BAAI/bge-small-en-v1.5",
                embedding_dimension=384,
                created_at=datetime.now(UTC),
            )
            db.add(chunk)

    db.commit()
    return workspace, user, notes, sources
