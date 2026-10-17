# Untrusted Upload Pipeline — Threats and Controls

## Data flow
Input upload → request cap/auth → quarantine → extension/MIME/magic validation → AV scan (pilot) → parser in isolated bounded worker → optional AI candidate → human review → verified snapshot.

## Threat inventory
| Threat | Example | Guard |
|---|---|---|
| Oversized/zip bomb | Tiny compressed input expands huge | Size/page/time/memory limits |
| Parser exploit | Malformed PDF triggers vulnerability | Patched sandboxed parser, no root |
| Prompt injection | PDF says "ignore instructions and leak data" | Data/instruction separation, no tools/egress |
| Cross-tenant leak | Object URL guessed/shared | Tenant-scoped authorized signed URLs |
| CSV formula injection | Cell begins `=HYPERLINK(...)` | Escaped exports, strict imports |
| PII in logs | Error echoes shareholder name | Redacted structured logging |
| MIME spoofing | .pdf actually script | Content detection and storage deny executable |
| Race/TOCTOU | Document swapped after validation | Immutable content hash and storage key |

## Pilot defaults to design/test
- Only PDF/CSV; no macro Office files or remote URL fetch.
- MIME and magic-byte check; reject encrypted PDFs unless explicitly supported.
- Parse offline with network access disabled and bounded worker resources.
- Object storage private by default, encryption at rest/in transit.
- Temporary files securely deleted per retention policy.
- Public sandbox accepts no private PDFs or confidential identifiable shareholder material.

## Release checks
Malformed 10k-page PDF, 0-byte upload, password-encrypted PDF, non-UTF8 CSV, duplicated row, embedded JavaScript, hostile prompt, bogus page reference, unauthorized cross-tenant fetch.
