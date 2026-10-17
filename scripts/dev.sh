#!/usr/bin/env bash
set -euo pipefail

# Determine script and project directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_ROOT}"

# Ensure root .env exists by copying .env.example if absent
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    echo "No .env file found. Initializing .env from .env.example..."
    cp .env.example .env
fi

# Ensure frontend .env exists if frontend/.env.example is present
if [ -d "frontend" ] && [ -f "frontend/.env.example" ] && [ ! -f "frontend/.env" ]; then
    echo "Initializing frontend/.env from frontend/.env.example..."
    cp frontend/.env.example frontend/.env
fi

echo "Starting Hyades stack (docker compose up --build)..."
exec docker compose up --build "$@"
