# Docker Compose Watch Guide

Knowledge Atlas supports Docker Compose Watch (`develop.watch`) for granular, service-isolated hot reloading and container updates during development.

## Starting Watch Mode

To start the development stack with Docker Compose Watch:

```bash
docker compose watch
```

Or run watch alongside standard `up`:

```bash
docker compose up -d
docker compose watch
```

## Service Watch Rules

Watch rules are scoped to prevent unnecessary full-stack rebuilds and ensure development changes automatically update **only** the affected container.

### 1. Frontend Service (`knowledge_atlas_frontend`)
- **Source sync (`action: sync`)**:
  - `./frontend/src` → synced to `/app/src` in real-time (triggers Vite HMR immediately)
  - `./frontend/public` → synced to `/app/public`
  - `./frontend/index.html` → synced to `/app/index.html`
- **Dependency & Config rebuild (`action: rebuild`)**:
  - `./frontend/package.json`
  - `./frontend/package-lock.json`
  - `./frontend/Dockerfile`
  - `./frontend/vite.config.ts`

### 2. Backend Service (`knowledge_atlas_backend`)
- **Source sync with restart (`action: sync+restart`)**:
  - `./backend/app` → synced to `/app/app` and restarts Uvicorn
  - `./backend/alembic` → synced to `/app/alembic` and restarts backend container
- **Dependency & Dockerfile rebuild (`action: rebuild`)**:
  - `./backend/pyproject.toml`
  - `./backend/uv.lock`
  - `./backend/Dockerfile`

### 3. Data & Storage Safety
- **PostgreSQL (`knowledge_atlas_postgres`)**: Named volume `postgres_data` is untouched and persists all database tables.
- **Qdrant (`knowledge_atlas_qdrant`)**: Vector index storage `qdrant_data` is preserved.
- **Git Repositories (`git_repositories`)**: Preserved across all sync and rebuild operations.
