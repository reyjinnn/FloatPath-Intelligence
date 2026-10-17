# Threat Model — STRIDE / abuse cases

## Assets
Customer shareholder data (possibly personal/confidential), uploaded documents, rulebook provenance, assessments, API keys, reports, authorization grants.

## Actors and trust boundaries
Unauthenticated demo viewer; authenticated tenant user/reviewer; administrator; adversarial uploader; cloud/AI processor. Boundaries: browser↔API, tenant↔tenant, upload↔parser, API↔OpenAI, API↔DB/storage, demo↔pilot.

## Threats and controls
| Threat | Example | Mitigation | Test |
|---|---|---|---|
| Spoofing | forged session | OIDC/MFA if required, signed session, expiration | SEC-001 |
| Tampering | modify locked snapshot | DB immutable version, checksums, audit | SEC-002 |
| Repudiation | deny approval | append-only reviewer event | SEC-003 |
| Info disclosure | tenant A reads B document | tenant scoped auth/RLS, signed short-lived downloads | SEC-004 |
| DoS | enormous PDFs/requests | bytes/page limits, queue/concurrency, quotas, timeouts | SEC-005 |
| Privilege escalation | demo calls admin API | route authorization, deny by default | SEC-006 |
| Prompt injection | PDF says reveal data | tool isolation, schema validation, no side-effects | SEC-007 |
| Model data leakage | send confidential PDF to AI without grant | consent policy, DPA/subprocessor assessment, opt-out/disable | SEC-008 |
| Data poisoning | false shareholder flags | evidence requirements, two-person review | SEC-009 |
| Formula manipulation | JS sends fake result | server recompute from signed inputs | SEC-010 |

## Security requirements
TLS, CSRF strategy for cookies, secure headers, CORS allowlist, rate limits, service keys secrets manager, storage private by default, restricted DB network, backups encrypted, dependency scanning, incident logging.

## Risk acceptance
Before public demo: no raw shareholder data and no public upload. Before confidential pilot: formal privacy/pen test or appropriate security review, DPA, ROPA where applicable, access controls, backup/restore drill, deletion procedure.

## Incident response
Detect → contain credentials/tenant boundaries → preserve sanitized audit evidence → assess impact/legal notices → remediate → postmortem. Define accountable incident owner before processing production data.
