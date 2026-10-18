# Security & Privacy Requirements Checklist

## Authentication / authorization
- [ ] Demo tenant strictly read-only and synthetic.
- [ ] Pilot actors: ADMIN, ANALYST, REVIEWER, VIEWER; enforce server-side.
- [ ] Resource access scoped by `tenant_id`; object key not user-controlled.
- [ ] Re-authorization on export/download; avoid IDOR.

## Data protection
- [ ] Sensitive identifiers masked in logs and screenshots.
- [ ] At-rest encryption and TLS for pilot; secrets via env/secret manager.
- [ ] Per-tenant retention/deletion controls; secure ephemeral extraction copies.
- [ ] Private bucket with signed URLs, short expiry; no public ACL.
- [ ] Backup/restore and deletion of backups addressed contractually.

## Current Baseline & Prototype Architecture (Synthetic Only)

### Password and Credential Controls
- Standard user creation (`apps/api/schemas.py:CreateUserBody` and `apps/api/auth.py:hash_password`) enforces a **12+ character minimum** (up to 256 characters) with PBKDF2-HMAC-SHA256 (600,000 iterations, 16-byte cryptographically secure random salt per user).
- **No hardcoded demo passwords or silent user overwrites:** Seeding commands (`manage_workspace.py seed`) seed only company catalog records and never overwrite existing user records or alter existing roles/passwords.
- `python scripts/manage_workspace.py demo-credentials` explicitly provisions only the `admin`, `reviewer`, `analyst`, and `viewer` synthetic accounts. It reads a password from a hidden confirmation prompt, or `FLOATPATH_DEMO_PASSWORD` if provided. That variable alone has no seeding effect. Do not commit it, pass passwords as CLI arguments, or leave it in shared environments.
- The requested shared demo credential is 11 characters: `--allow-short-demo-password` explicitly permits an 11-character minimum **only for this local synthetic management command**. Standard API and `create-user` paths keep the 12-character policy. A shared demo password is publicly known, not a production secret; never reuse it outside an isolated synthetic workspace.
- Existing accounts are skipped by default, including usernames that match demo roles. To deliberately rotate them, run `python scripts/manage_workspace.py demo-credentials --reset-existing --allow-short-demo-password` and enter the requested synthetic password at the hidden prompt. Existing roles and IDs are preserved; unrelated accounts are untouched.
- Explicit credential rotation (`--reset-existing`) atomically revokes all stored sessions for targeted accounts and records an audited event (`ROTATE_DEMO_CREDENTIAL`) without logging raw secret values or PBKDF2 hashes. Creation also records `CREATE_DEMO_USER`. Login checks for concurrent password rotation before minting a session. Restart API workers after changing bearer tokens; this CLI rotates passwords, not machine credentials.
- Active sessions use high-entropy opaque bearer tokens (`secrets.token_urlsafe(32)`). The server stores only the SHA-256 token hash (`token_hash`) in `workspace_sessions`.
- Sessions are carried in `HttpOnly`, `SameSite=Strict` cookies, with `Secure` flags configured via `FLOATPATH_COOKIE_SECURE`.

### Identifiers & Audit Traceability
- Newly generated entity identifiers (`companies`, `snapshots`, `assessments`, `scenarios`, `reports`, users, and audit events), actor identities (session user IDs and stable bearer/CLI UUIDv5 actors), and request correlation IDs use UUID strings. `X-Correlation-ID` accepts a UUID and normalizes it; missing or non-UUID headers receive a fresh UUID. Public demo scenario/report IDs also use deterministic UUIDv5 identities, separate from unchanged result hashes.
- Fixed namespaces (`synthetic`), fixture/holder references (`fixture://...`, `holder_ref`), codes, rule-set/version labels, session token hashes, idempotency keys, and cryptographic digests (`sha256:...`) are not entity UUIDs.
- Immutable database triggers protect locked snapshots, scenarios, reports, assessments, and audit logs. Historical audit actor/entity/correlation labels may be non-UUID: no migration rewrites these or existing payloads/hashes. UUIDs are identifiers, not authorization or anonymization controls.

### Infrastructure Blockers for Production / Pilot (No Invented Encryption)
The application avoids rolling home-grown cryptographic ciphers or pseudo-encryption layers inside application logic. The following infrastructure-level controls are required before processing production or pilot records:
1. **At-Rest Storage Encryption (Disk Blockers):** Database volumes and local storage must be encrypted at the host or cloud block-device level (e.g., LUKS, AWS EBS encrypted volumes, or managed RDS storage encryption). The local development/prototype SQLite/Postgres instances do not perform application-level database file encryption.
2. **KMS / Secrets Manager Integration (Key Management Blockers):** Production deployments require a managed Key Management Service (e.g., AWS KMS, Google Cloud KMS, or HashiCorp Vault) for envelope encryption and dynamic rotation of database passwords, API signing secrets, and bearer tokens. The synthetic prototype relies strictly on process environment variables (`DATABASE_URL`, `FLOATPATH_ANALYST_TOKEN`, `FLOATPATH_REVIEWER_TOKEN`, `FLOATPATH_DEMO_PASSWORD`) without in-app key derivation tricks.
3. **Transport Layer Security (TLS Blocker):** Production API traffic must terminate TLS 1.3 at the ingress reverse proxy / application load balancer (ALB / Cloudflare / Nginx) with strict HSTS policies. The FastAPI application runs in HTTP mode behind the TLS termination boundary in development.
4. **Non-Production Assertion:** The system is explicitly configured for synthetic evaluation only. It does not assert production readiness, financial recommendation capability, or statutory regulatory compliance.

## Upload processing
- [ ] MIME + file signature validation, page/size limits, malware check.
- [ ] PDF parser isolated; reject embedded executable / remote retrieval.
- [ ] Sanitize filenames and download content disposition.
- [ ] Reject password-protected or malformed files unless explicitly supported.

## LLM processing
- [ ] Record lawful source permission and explicit client agreement.
- [ ] Document vendor subprocessors and data retention/transfer.
- [ ] No tools to send emails, write files outside tenant, or fetch arbitrary URLs.
- [ ] Red-team doc injections & output JSON structure.

## Audit / monitoring
- [ ] Log actor, event, timestamp, source hash, rule set version.
- [ ] Monitor auth failures, import failures, data access anomalies.
- [ ] Define incident communication and on-call ownership.

## Secure CI/CD
- [ ] Secret scanning; software composition analysis; pinned dependencies.
- [ ] Unit/integration/e2e gates; deployment approval on production.
- [ ] No real confidential records in CI, error tracking, or screenshots.
