"""Git versioning service for Markdown note history.

Canonical service per CONTRACT v0.3.1 §5.3, §11.2, §11.3, §18.1.
Provides init_repo, write_note, read_note, snapshot, get_history, get_diff, read_version, restore.
"""

import logging
import subprocess
import threading
import uuid
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.core.exceptions import GitPathInvalidError, GitRepositoryError

logger = logging.getLogger("app.services.git_service")

# Repository-level locks per workspace
_repo_locks: dict[str, threading.Lock] = {}
_locks_lock = threading.Lock()


def _get_lock(workspace_id: uuid.UUID) -> threading.Lock:
    ws_key = str(workspace_id)
    with _locks_lock:
        if ws_key not in _repo_locks:
            _repo_locks[ws_key] = threading.Lock()
        return _repo_locks[ws_key]


def _get_repo_dir(workspace_id: uuid.UUID) -> Path:
    base = Path(settings.GIT_REPOSITORY_ROOT).resolve()
    try:
        base.mkdir(parents=True, exist_ok=True)
    except (PermissionError, OSError):
        base = (Path.home() / ".knowledge-atlas" / "workspaces").resolve()
        base.mkdir(parents=True, exist_ok=True)
    repo_dir = (base / str(workspace_id) / "repository").resolve()
    return repo_dir


def _get_note_path(workspace_id: uuid.UUID, note_id: uuid.UUID) -> Path:
    """Resolve note file path and strictly enforce path containment per CONTRACT §11.2, §18.1."""
    repo_dir = _get_repo_dir(workspace_id)
    # Ensure note_id is a valid UUID string
    try:
        note_uuid = uuid.UUID(str(note_id))
    except Exception as e:
        raise GitPathInvalidError("Invalid note UUID for Git path.") from e

    note_path = (repo_dir / f"{note_uuid}.md").resolve()

    # Security check: must start with repo_dir
    try:
        note_path.relative_to(repo_dir)
    except ValueError as e:
        raise GitPathInvalidError("Path traversal attempt detected.") from e

    return note_path


def _run_git(args: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    """Execute Git command using argument arrays with timeout and hook protection."""
    cmd = ["git", "-c", "core.hooksPath=/dev/null"] + args
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=settings.PROVIDER_TIMEOUT_SECONDS,
            check=False,
        )
        if result.returncode != 0:
            logger.error(
                "Git command failed: %s (code: %d, err: %s)",
                args,
                result.returncode,
                result.stderr.strip(),
            )
            raise GitRepositoryError(f"Git operation failed: {result.stderr.strip()[:200]}")
        return result
    except subprocess.TimeoutExpired as e:
        raise GitRepositoryError("Git operation timed out.") from e
    except GitRepositoryError:
        raise
    except Exception as e:
        raise GitRepositoryError(f"Git execution failed: {e}") from e


def init_repo(workspace_id: uuid.UUID) -> Path:
    """Initialize a Git repository for workspace if not present. Idempotent."""
    repo_dir = _get_repo_dir(workspace_id)
    lock = _get_lock(workspace_id)
    with lock:
        repo_dir.mkdir(parents=True, exist_ok=True)
        git_dir = repo_dir / ".git"
        if not git_dir.exists():
            _run_git(["init"], cwd=repo_dir)
            _run_git(["config", "user.name", "Hyades"], cwd=repo_dir)
            _run_git(["config", "user.email", "atlas@knowledge.local"], cwd=repo_dir)
            # Create an initial commit with a placeholder to establish HEAD
            init_file = repo_dir / ".ka-init"
            init_file.write_text("Hyades Workspace Git Repository\n")
            _run_git(["add", ".ka-init"], cwd=repo_dir)
            _run_git(["commit", "-m", "Initialize workspace repository"], cwd=repo_dir)
    return repo_dir


def write_note(workspace_id: uuid.UUID, note_id: uuid.UUID, content: str) -> None:
    """Write Markdown content to the note path."""
    init_repo(workspace_id)
    note_path = _get_note_path(workspace_id, note_id)
    lock = _get_lock(workspace_id)
    with lock:
        note_path.write_text(content, encoding="utf-8")


def read_note(workspace_id: uuid.UUID, note_id: uuid.UUID) -> str:
    """Read current content from disk or HEAD."""
    note_path = _get_note_path(workspace_id, note_id)
    if not note_path.exists():
        return ""
    return note_path.read_text(encoding="utf-8")


def snapshot(
    workspace_id: uuid.UUID,
    note_id: uuid.UUID,
    message: str,
    author_id: uuid.UUID,
    is_ai_edit: bool = False,
) -> str:
    """Stage file, commit, and return the 40-character Git SHA-1 commit hash."""
    repo_dir = init_repo(workspace_id)
    note_path = _get_note_path(workspace_id, note_id)
    lock = _get_lock(workspace_id)
    with lock:
        rel_path = note_path.name
        _run_git(["add", rel_path], cwd=repo_dir)
        commit_msg = message.strip() or f"Update note {note_id}"
        if is_ai_edit:
            commit_msg = f"[AI] {commit_msg}"
        _run_git(
            [
                "commit",
                "--allow-empty",
                "-m",
                commit_msg,
                "--author",
                f"User <{author_id}@atlas.local>",
            ],
            cwd=repo_dir,
        )
        res = _run_git(["rev-parse", "HEAD"], cwd=repo_dir)
        commit_hash = res.stdout.strip()
        return commit_hash


def get_history(workspace_id: uuid.UUID, note_id: uuid.UUID) -> list[dict[str, Any]]:
    """Return list of commits modifying note_id."""
    repo_dir = init_repo(workspace_id)
    note_path = _get_note_path(workspace_id, note_id)
    lock = _get_lock(workspace_id)
    with lock:
        rel_path = note_path.name
        res = _run_git(
            ["log", "--follow", "--format=%H|%an|%ad|%s", "--date=iso-strict", "--", rel_path],
            cwd=repo_dir,
        )
        commits: list[dict[str, Any]] = []
        for line in res.stdout.splitlines():
            parts = line.strip().split("|", 3)
            if len(parts) == 4:
                c_hash, author, date_str, msg = parts
                is_ai = msg.startswith("[AI]")
                commits.append(
                    {
                        "commit_hash": c_hash,
                        "author": author,
                        "created_at": date_str,
                        "message": msg,
                        "is_ai_edit": is_ai,
                    }
                )
        return commits


def get_diff(
    workspace_id: uuid.UUID,
    note_id: uuid.UUID,
    from_commit: str,
    to_commit: str,
) -> str:
    """Return unified diff string between two commits for note_id."""
    repo_dir = init_repo(workspace_id)
    note_path = _get_note_path(workspace_id, note_id)
    lock = _get_lock(workspace_id)
    with lock:
        rel_path = note_path.name
        res = _run_git(
            ["diff", "-u", from_commit, to_commit, "--", rel_path],
            cwd=repo_dir,
        )
        return res.stdout


def read_version(
    workspace_id: uuid.UUID,
    note_id: uuid.UUID,
    commit_hash: str,
) -> str:
    """Return file content at a specific commit."""
    repo_dir = init_repo(workspace_id)
    note_path = _get_note_path(workspace_id, note_id)
    lock = _get_lock(workspace_id)
    with lock:
        rel_path = note_path.name
        res = _run_git(["show", f"{commit_hash}:{rel_path}"], cwd=repo_dir)
        return res.stdout


def restore(
    workspace_id: uuid.UUID,
    note_id: uuid.UUID,
    commit_hash: str,
    author_id: uuid.UUID,
) -> str:
    """Restore file content from commit_hash by creating a NEW commit. Never rewrite history."""
    content = read_version(workspace_id, note_id, commit_hash)
    write_note(workspace_id, note_id, content)
    new_commit = snapshot(
        workspace_id=workspace_id,
        note_id=note_id,
        message=f"Restore version from {commit_hash[:7]}",
        author_id=author_id,
        is_ai_edit=False,
    )
    return new_commit
