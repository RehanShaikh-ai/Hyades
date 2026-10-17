import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

# Ensure backend root is on Python path so app imports resolve
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Alembic Config object
config = context.config

# Interpret the config file for Python logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Interface I-006: Fixed imports required in env.py
try:
    import app.models  # noqa: F401 - Register all models on Base.metadata (Contract §0.4)
    from app.core.config import settings
    from app.db.base import Base

    target_metadata = Base.metadata
except ImportError:
    settings = None
    Base = None
    target_metadata = None


def get_database_url() -> str:
    """Resolve the canonical PostgreSQL database connection URL."""
    if settings is not None:
        if hasattr(settings, "database_url") and settings.database_url:
            return str(settings.database_url)
        if hasattr(settings, "DATABASE_URL") and settings.DATABASE_URL:
            return str(settings.DATABASE_URL)
        user = getattr(settings, "DATABASE_USER", os.getenv("DATABASE_USER", "knowledge_atlas"))
        password = getattr(
            settings, "DATABASE_PASSWORD", os.getenv("DATABASE_PASSWORD", "change_me")
        )
        host = getattr(settings, "DATABASE_HOST", os.getenv("DATABASE_HOST", "postgres"))
        port = getattr(settings, "DATABASE_PORT", os.getenv("DATABASE_PORT", "5432"))
        name = getattr(settings, "DATABASE_NAME", os.getenv("DATABASE_NAME", "knowledge_atlas"))
        return f"postgresql+psycopg://{user}:{password}@{host}:{port}/{name}"

    env_url = os.getenv("DATABASE_URL")
    if env_url:
        return env_url

    user = os.getenv("DATABASE_USER", "knowledge_atlas")
    password = os.getenv("DATABASE_PASSWORD", "change_me")
    host = os.getenv("DATABASE_HOST", "postgres")
    port = os.getenv("DATABASE_PORT", "5432")
    name = os.getenv("DATABASE_NAME", "knowledge_atlas")
    return f"postgresql+psycopg://{user}:{password}@{host}:{port}/{name}"


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = get_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = get_database_url()

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
