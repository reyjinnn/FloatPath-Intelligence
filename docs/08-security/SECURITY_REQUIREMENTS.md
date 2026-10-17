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
