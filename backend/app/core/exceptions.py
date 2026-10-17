"""Domain exception classes.

Canonical exceptions per contract §13 (v0.1.1-v0.3.2) and CONTRACT v0.4.1 §11.
"""

from fastapi import HTTPException, status


class AppException(HTTPException):
    """Base application exception with explicit error code."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(status_code=status_code, detail=message, headers=headers)
        self.code = code
        self.message = message


class UserNotFoundError(AppException):
    """Raised when a user is not found (404, USER_NOT_FOUND)."""

    def __init__(self, message: str = "User not found.") -> None:
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            code="USER_NOT_FOUND",
            message=message,
        )


class WorkspaceNotFoundError(AppException):
    """Raised when a workspace is not found (404, WORKSPACE_NOT_FOUND)."""

    def __init__(self, message: str = "Workspace not found.") -> None:
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            code="WORKSPACE_NOT_FOUND",
            message=message,
        )


class NoteNotFoundError(AppException):
    """Raised when a note is not found (404, NOTE_NOT_FOUND)."""

    def __init__(self, message: str = "Note not found.") -> None:
        super().__init__(status.HTTP_404_NOT_FOUND, "NOTE_NOT_FOUND", message)


class TagNotFoundError(AppException):
    """Raised when a tag is not found (404, TAG_NOT_FOUND)."""

    def __init__(self, message: str = "Tag not found.") -> None:
        super().__init__(status.HTTP_404_NOT_FOUND, "TAG_NOT_FOUND", message)


class ConflictError(AppException):
    """Raised when a note link duplicates an existing link (409, CONFLICT)."""

    def __init__(self, message: str = "The requested link already exists.") -> None:
        super().__init__(status.HTTP_409_CONFLICT, "CONFLICT", message)


class DuplicateTagError(AppException):
    """Raised when a tag is already assigned to a note (409, DUPLICATE_TAG)."""

    def __init__(self, message: str = "The tag is already assigned to this note.") -> None:
        super().__init__(status.HTTP_409_CONFLICT, "DUPLICATE_TAG", message)


class ValidationError(AppException):
    """Raised for domain validation failures (422, VALIDATION_ERROR)."""

    def __init__(self, message: str) -> None:
        super().__init__(status.HTTP_422_UNPROCESSABLE_CONTENT, "VALIDATION_ERROR", message)


class SourceNotFoundError(AppException):
    """Raised when a source is not found (404, SOURCE_NOT_FOUND)."""

    def __init__(self, message: str = "Source not found.") -> None:
        super().__init__(status.HTTP_404_NOT_FOUND, "SOURCE_NOT_FOUND", message)


# ── v0.3.1 Exceptions (CONTRACT §14) ──────────────────────────────────────────


class VersionNotFoundError(AppException):
    """Raised when a version or commit is not found (404, VERSION_NOT_FOUND)."""

    def __init__(self, message: str = "Note version not found.") -> None:
        super().__init__(status.HTTP_404_NOT_FOUND, "VERSION_NOT_FOUND", message)


class JobNotFoundError(AppException):
    """Raised when an index job is not found (404, JOB_NOT_FOUND)."""

    def __init__(self, message: str = "Job not found.") -> None:
        super().__init__(status.HTTP_404_NOT_FOUND, "JOB_NOT_FOUND", message)


class RAGContextEmptyError(AppException):
    """Raised when zero chunks are retrieved for RAG (422, RAG_CONTEXT_EMPTY)."""

    def __init__(self, message: str = "No relevant context found to answer the query.") -> None:
        super().__init__(status.HTTP_422_UNPROCESSABLE_CONTENT, "RAG_CONTEXT_EMPTY", message)


class EmbeddingDimensionMismatchError(AppException):
    """Raised when embedding dimension != collection dimension (422)."""

    def __init__(
        self, message: str = "Embedding dimension does not match collection dimension."
    ) -> None:
        super().__init__(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "EMBEDDING_DIMENSION_MISMATCH", message
        )


class UnsupportedSearchModeError(AppException):
    """Raised when a requested search mode is unavailable (422, UNSUPPORTED_SEARCH_MODE)."""

    def __init__(self, message: str = "The requested search mode is unavailable.") -> None:
        super().__init__(status.HTTP_422_UNPROCESSABLE_CONTENT, "UNSUPPORTED_SEARCH_MODE", message)


class VectorStoreUnavailableError(AppException):
    """Raised when Qdrant is unreachable (500, VECTOR_STORE_UNAVAILABLE)."""

    def __init__(self, message: str = "Vector store is currently unavailable.") -> None:
        super().__init__(status.HTTP_500_INTERNAL_SERVER_ERROR, "VECTOR_STORE_UNAVAILABLE", message)


class EmbeddingProviderUnavailableError(AppException):
    """Raised when embedding provider is unreachable (500, EMBEDDING_PROVIDER_UNAVAILABLE)."""

    def __init__(self, message: str = "Embedding provider is currently unavailable.") -> None:
        super().__init__(
            status.HTTP_500_INTERNAL_SERVER_ERROR, "EMBEDDING_PROVIDER_UNAVAILABLE", message
        )


class LLMProviderUnavailableError(AppException):
    """Raised when LLM provider is unreachable (500, LLM_PROVIDER_UNAVAILABLE)."""

    def __init__(self, message: str = "LLM provider is currently unavailable.") -> None:
        super().__init__(status.HTTP_500_INTERNAL_SERVER_ERROR, "LLM_PROVIDER_UNAVAILABLE", message)


class LLMTimeoutError(AppException):
    """Raised when LLM call exceeds timeout (500, LLM_TIMEOUT)."""

    def __init__(self, message: str = "LLM call timed out.") -> None:
        super().__init__(status.HTTP_500_INTERNAL_SERVER_ERROR, "LLM_TIMEOUT", message)


class GitRepositoryError(AppException):
    """Raised when a Git operation fails (500, GIT_REPOSITORY_ERROR)."""

    def __init__(self, message: str = "Git repository operation failed.") -> None:
        super().__init__(status.HTTP_500_INTERNAL_SERVER_ERROR, "GIT_REPOSITORY_ERROR", message)


class GitPathInvalidError(AppException):
    """Raised when computed path fails traversal check (422, GIT_PATH_INVALID)."""

    def __init__(self, message: str = "Invalid file path in Git repository.") -> None:
        super().__init__(status.HTTP_422_UNPROCESSABLE_CONTENT, "GIT_PATH_INVALID", message)


# ── v0.3.2 Exceptions (CONTRACT §11) ──────────────────────────────────────────


class EntityNotFoundError(AppException):
    """Raised when an entity is not found (404, ENTITY_NOT_FOUND)."""

    def __init__(self, message: str = "Entity not found.") -> None:
        super().__init__(status.HTTP_404_NOT_FOUND, "ENTITY_NOT_FOUND", message)


class RelationshipNotFoundError(AppException):
    """Raised when a relationship is not found (404, RELATIONSHIP_NOT_FOUND)."""

    def __init__(self, message: str = "Relationship not found.") -> None:
        super().__init__(status.HTTP_404_NOT_FOUND, "RELATIONSHIP_NOT_FOUND", message)


class ClusterNotFoundError(AppException):
    """Raised when a cluster is not found (404, CLUSTER_NOT_FOUND)."""

    def __init__(self, message: str = "Cluster not found.") -> None:
        super().__init__(status.HTTP_404_NOT_FOUND, "CLUSTER_NOT_FOUND", message)


class SuggestionNotFoundError(AppException):
    """Raised when a link suggestion is not found (404, SUGGESTION_NOT_FOUND)."""

    def __init__(self, message: str = "Link suggestion not found.") -> None:
        super().__init__(status.HTTP_404_NOT_FOUND, "SUGGESTION_NOT_FOUND", message)


class SuggestionAlreadyDecidedError(AppException):
    """Raised when accept/reject is called on a non-pending suggestion.

    HTTP 422, SUGGESTION_ALREADY_DECIDED.
    """

    def __init__(self, message: str = "Link suggestion has already been decided.") -> None:
        super().__init__(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "SUGGESTION_ALREADY_DECIDED", message
        )


class ExtractionFailedError(AppException):
    """Raised when LLM extraction job fails (500, EXTRACTION_FAILED)."""

    def __init__(self, message: str = "Knowledge extraction failed.") -> None:
        super().__init__(status.HTTP_500_INTERNAL_SERVER_ERROR, "EXTRACTION_FAILED", message)


class GraphIndexError(AppException):
    """Raised when graph indexing or vector payload update fails (500, GRAPH_INDEX_ERROR)."""

    def __init__(self, message: str = "Graph indexing error.") -> None:
        super().__init__(status.HTTP_500_INTERNAL_SERVER_ERROR, "GRAPH_INDEX_ERROR", message)


# ── v0.4.1 Exceptions (CONTRACT §11) ──────────────────────────────────────────


class ConversationNotFoundError(AppException):
    """Raised when a conversation is not found (404, CONVERSATION_NOT_FOUND)."""

    def __init__(self, message: str = "Conversation not found.") -> None:
        super().__init__(status.HTTP_404_NOT_FOUND, "CONVERSATION_NOT_FOUND", message)


class MessageNotFoundError(AppException):
    """Raised when a message is not found (404, MESSAGE_NOT_FOUND)."""

    def __init__(self, message: str = "Message not found.") -> None:
        super().__init__(status.HTTP_404_NOT_FOUND, "MESSAGE_NOT_FOUND", message)


class SourceNotRetryableError(AppException):
    """Raised when retry is attempted on a non-failed source (422, SOURCE_NOT_RETRYABLE)."""

    def __init__(self, message: str = "Only failed sources can be retried.") -> None:
        super().__init__(status.HTTP_422_UNPROCESSABLE_CONTENT, "SOURCE_NOT_RETRYABLE", message)


class UnsupportedSourceTypeError(AppException):
    """Raised when an uploaded file type is unsupported (422, UNSUPPORTED_SOURCE_TYPE)."""

    def __init__(self, message: str = "Unsupported source file type.") -> None:
        super().__init__(status.HTTP_422_UNPROCESSABLE_CONTENT, "UNSUPPORTED_SOURCE_TYPE", message)


class SourceProcessingFailedError(AppException):
    """Raised when source processing fails after retries (500, SOURCE_PROCESSING_FAILED)."""

    def __init__(self, message: str = "Source processing failed.") -> None:
        super().__init__(status.HTTP_500_INTERNAL_SERVER_ERROR, "SOURCE_PROCESSING_FAILED", message)
