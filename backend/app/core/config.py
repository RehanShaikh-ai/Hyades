"""Application configuration.

Loads settings from environment variables using pydantic-settings.
Canonical module per contract §4.2.
"""

import logging

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("app.core.config")


class Settings(BaseSettings):
    """Application settings loaded from environment variables.

    All canonical environment variable names are defined in contract §5.1, §15.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    # Application
    APP_ENV: str = "development"
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8080

    # Database
    DATABASE_HOST: str = "postgres"
    DATABASE_PORT: int = 5432
    DATABASE_NAME: str = "knowledge_atlas"
    DATABASE_USER: str = "knowledge_atlas"
    DATABASE_PASSWORD: str = "change_me"
    DATABASE_URL: str | None = None

    # Frontend
    FRONTEND_URL: str = "http://localhost:5173"

    # v0.3.1 — Vector store & AI (Contract §15)
    QDRANT_URL: str = "http://qdrant:6333"
    QDRANT_COLLECTION_PREFIX: str = "ka"
    REDIS_URL: str = "redis://redis:6379/0"
    GIT_REPOSITORY_ROOT: str = "/data/workspaces"
    EMBEDDING_PROVIDER: str = "fastembed"
    EMBEDDING_MODEL: str = "BAAI/bge-small-en-v1.5"
    EMBEDDING_DIMENSION: int = 384
    CHUNK_SIZE: int = 512
    CHUNK_OVERLAP: int = 64
    CHUNKING_STRATEGY: str = "markdown_heading"
    LLM_PROVIDER: str = "freellmapi"
    LLM_MODEL: str = "auto"
    OLLAMA_BASE_URL: str = "http://ollama:11434"
    OMNIROUTE_BASE_URL: str = ""
    FREELLMAPI_BASE_URL: str = "http://localhost:3001"
    FREELLMAPI_API_KEY: str | None = None
    JOB_MAX_RETRIES: int = 3
    PROVIDER_TIMEOUT_SECONDS: int = 30
    CONTEXT_TOKEN_LIMIT: int = 4096
    RAG_MIN_RELEVANCE_SCORE: float = 0.45

    # v0.4.1 — Usability, Sources & Persistent Assistant (Contract §15)
    CONVERSATION_HISTORY_LIMIT: int = 10
    SOURCE_MAX_FILE_SIZE_MB: int = 25
    SOURCE_PROCESSING_TIMEOUT_SECONDS: int = 120

    @property
    def database_url(self) -> str:
        """Construct the canonical PostgreSQL URL (contract §18).

        Format: postgresql+psycopg://<user>:<password>@<host>:<port>/<database>
        """
        if self.DATABASE_URL:
            return self.DATABASE_URL

        from sqlalchemy import URL

        url = URL.create(
            drivername="postgresql+psycopg",
            username=self.DATABASE_USER,
            password=self.DATABASE_PASSWORD,
            host=self.DATABASE_HOST,
            port=self.DATABASE_PORT,
            database=self.DATABASE_NAME,
        )
        return url.render_as_string(hide_password=False)


settings = Settings()
