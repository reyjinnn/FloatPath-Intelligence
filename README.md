# FloatPath Intelligence

FloatPath Intelligence is a free-float assessment and corporate action scenario planning prototype for Corporate Secretaries, share registrar (BAE) teams, and issuer advisors. It turns shareholding snapshots into reproducible calculations, scenario comparisons, and evidence-linked decision reports.

**Synthetic data only.** The current application is an authenticated, single-workspace prototype, not a production compliance service. Regulatory assumptions remain draft or unverified; results use `SIMULATION_ONLY` or `REQUIRES_VERIFICATION`, not legal compliance certification.

## What the Project Does

- Creates synthetic company records and imports or edits shareholding ledgers.
- Validates share balances, records eligibility evidence, and supports reviewer locking of snapshots.
- Calculates baseline free-float metrics and simulates share transfers (`TRANSFER`) and new-share issuance (`NEW_ISSUANCE`).
- Re-evaluates the entire holder ledger after a simulated action instead of assuming recipients remain eligible.
- Saves and compares scenarios, generates Markdown reports, and records audit events and reproducibility hashes.
- Provides authenticated access with `admin`, `reviewer`, `analyst`, and `viewer` roles.

The engine uses integer share counts and Python `Decimal` arithmetic. Numeric and rule decisions do not depend on an LLM or network access.

There is no live market feed, scraping, private Datindo/BEI/KSEI integration, transaction execution, or automatic regulatory submission. Document uploads and AI extraction are disabled with `503 SYNTHETIC_MANUAL_ONLY`. Datindo is not a confirmed partner. The application does not provide financial recommendations or legal opinions.

## Project Structure

```text
apps/
  api/                 FastAPI backend, authentication, persistence, migrations
  web/                 Next.js and TypeScript frontend (English UI)
packages/engine/       Pure Python deterministic simulation engine
datasets/synthetic/    Reproducible synthetic fixtures
docs/                  Product, regulatory, architecture, and quality specifications
infra/                 Docker and PostgreSQL configuration
scripts/               Workspace management and OpenAPI export utilities
tests/                 Engine, API, persistence, and security tests
```

## Requirements

- **Python 3.10:** the dependency lock, CI, and API container target this version.
- **Node.js 22 and npm:** the frontend CI and container use Node.js 22.
- **Git.**

The local setup below uses **PowerShell on Windows without `.venv`**. Python dependencies are installed into your Windows user environment and may conflict with versions used by other projects. SQLite is the default database; Docker and PostgreSQL are not required for this setup.

## Run Locally

### 1. Install Backend Dependencies

Open PowerShell in the repository root:

```powershell
python --version
python -m pip install --user -r requirements.txt

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
}
```

If `python` resolves to another version, use `py -3.10` in place of `python` throughout these commands.

The root `.env.example` includes the local defaults:

```dotenv
DATABASE_URL=sqlite:///./floatpath.db
FLOATPATH_COOKIE_SECURE=false
FLOATPATH_PUBLIC_DEMO=false
FLOATPATH_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

Existing `.env` files are preserved. Review their settings if your installation uses a different database or origin. The backend loads the root `.env` automatically; process environment variables take precedence. Use plain `KEY=value` entries without surrounding quotes or shell expressions. Never commit passwords, tokens, or real `.env` files.

### 2. Initialize the Synthetic Workspace

From the repository root:

```powershell
python scripts/manage_workspace.py create-user --username local-admin --role admin
python scripts/manage_workspace.py seed
```

- Account creation prompts twice for a password of **12–256 characters**. There are no default credentials.
- `seed` loads five synthetic companies with snapshots, assessments, scenarios, and reports. It does not create users and skips existing companies rather than overwriting them.
- Management commands and API startup apply database migrations automatically. No separate migration command is required.
- The default SQLite database is `floatpath.db` in the current working directory. Run all backend and management commands from the repository root to use the same database.

Create the account once. If it already exists, sign in with its existing credentials instead of running `create-user` again.

### 3. Start the Backend

```powershell
python -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8000 --reload
```

Keep this terminal running.

- Health check: <http://127.0.0.1:8000/health>
- Interactive API documentation: <http://127.0.0.1:8000/docs>

### 4. Start the Frontend

Open a **second PowerShell terminal in the repository root**:

```powershell
Set-Location apps/web
node --version
npm --version

if (-not (Test-Path ".env.local")) {
    Copy-Item ".env.example" ".env.local"
}

npm ci
npm run dev
```

Open **<http://127.0.0.1:3000/login>** and sign in as `local-admin` with the password you created.

The frontend forwards `/api/v1` requests to the backend through a server-side rewrite. Its `.env.local` uses:

```dotenv
INTERNAL_API_URL=http://127.0.0.1:8000
```

Keep both local origins in `FLOATPATH_ALLOWED_ORIGINS`; cookie-authenticated requests require an allowed origin. Browser login does not require API tokens. Never put credentials in `NEXT_PUBLIC_*` variables.

### Subsequent Starts

Dependency installation and workspace initialization are setup steps, not required on every run. Start the backend from the root and run `npm run dev` from `apps/web` in a separate terminal. Stop either server with `Ctrl+C`.

For a frontend production build, run `npm run build` followed by `npm run start` from `apps/web`. The backend must still be running; a production build alone does not make this prototype deployment-ready.

## Tests and Validation

From the repository root:

```powershell
python -m unittest discover -s tests -v
python scripts/export_openapi.py --check
```

From `apps/web`:

```powershell
npm run typecheck
npm run build
```

### Browser Tests

Use a separate synthetic test database/workspace: browser tests create and modify records. Keep a seeded backend running. Playwright starts the frontend, not the backend.

Create accounts using `create-user --username NAME --role ROLE` from the repository root, or explicitly provision the four synthetic demo accounts:

```powershell
python scripts/manage_workspace.py demo-credentials
```

This prompts for a password shared by `admin`, `reviewer`, `analyst`, and `viewer`. Existing accounts are skipped. Shared credentials are for isolated synthetic demos only; do not assume an existing account has the newly entered password.

In the terminal used to run browser tests, set these environment variables to the provisioned credentials:

| Username variable | Password variable | Required role |
| --- | --- | --- |
| `FLOATPATH_E2E_USERNAME` | `FLOATPATH_E2E_PASSWORD` | Reviewer or admin |
| `FLOATPATH_E2E_ADMIN_USERNAME` | `FLOATPATH_E2E_ADMIN_PASSWORD` | Admin |
| `FLOATPATH_E2E_ANALYST_USERNAME` | `FLOATPATH_E2E_ANALYST_PASSWORD` | Analyst |
| `FLOATPATH_E2E_VIEWER_USERNAME` | `FLOATPATH_E2E_VIEWER_PASSWORD` | Viewer |

Then run from `apps/web`:

```powershell
npx playwright install chromium
npm test
```

## Limitations and Safety

- All demo companies, holdings, prices, evidence references, and results are synthetic. Do not enter real shareholder PII or private market data.
- Legal applicability, thresholds, exceptions, and source licensing require domain verification before any production use. Numeric target results are not compliance verdicts.
- PostgreSQL and container definitions are available in `infra/`, but the local SQLite steps above are the simplest supported walkthrough. Container startup does not provision users or seed the workspace.
- Local HTTP settings are not production security settings. Deployments require HTTPS, secure cookies, explicit allowed origins, network controls, and a separate security review.

Some planning documents describe future features. The implemented workflow and local commands above reflect the current prototype.
