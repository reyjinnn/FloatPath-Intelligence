# Local Development Setup — project not yet bootstrapped

## Prerequisites
Git, Node.js current LTS, Python supported stable (e.g. 3.12+), Docker Engine/Desktop + Compose plugin, PostgreSQL via Docker, optional OpenAI API key. Use project-pinned versions in future lock files.

## Proposed repository layout
```text
apps/web/            Next.js TS client
apps/api/            FastAPI server
packages/engine/     pure deterministic calculation/rules
packages/schemas/    JSON/OpenAPI generated types
datasets/synthetic/   synthetic-only fixtures
tests/               unit, integration, e2e, security
docs/                this documentation pack
infra/               compose/deploy templates
```

## Bootstrap commands (to run **after** code files are created)
```bash
git init
# pnpm create next-app apps/web --typescript
# python -m venv .venv
# pip install fastapi uvicorn pydantic sqlalchemy alembic psycopg pytest
# docker compose up -d postgres
# uvicorn apps.api.main:app --reload
# pnpm --dir apps/web dev
```

Commands are illustrative, **not executable as-is against documentation-only ZIP**. Create app scaffold and config first.

## `.env.example` variables (never commit real values)
`DATABASE_URL`, `APP_ENV`, `APP_PUBLIC_BASE_URL`, `CORS_ALLOWED_ORIGINS`, `OBJECT_STORE_ENDPOINT`, `OBJECT_STORE_BUCKET`, `OBJECT_STORE_ACCESS_KEY`, `OBJECT_STORE_SECRET_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `MAX_UPLOAD_BYTES`, `LOG_LEVEL`, `APP_SECRET_KEY`.

## Local quality commands (proposed)
`pytest -q`, `ruff check .`, `mypy`, `pnpm lint`, `pnpm typecheck`, `pnpm test:e2e`, migration smoke test, fixture hash checks.

## Local ports (proposed)
Web 3000, API 8000, PostgreSQL 5432 internal only. No public exposed DB port. Disable real AI calls in default unit tests.

## Troubleshooting checklist
Connection refused (compose up), missing env, migrations mismatch, CORS, object storage permission, invalid decimal serialization, unapproved ruleset, unsupported board.
