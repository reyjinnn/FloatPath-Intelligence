# Sprint Backlog — Proposed Issues

Priority `P0` must, `P1` should, `P2` post-MVP. Estimates are indicative solo-dev relative points (not days).

| ID | Task | P | Pts | Depends | Acceptance |
|---|---|---|---:|---|---|
| FP-001 | Init monorepo + CI/security scans | P0 | 3 | none | quality job green |
| FP-002 | Review source register/coverage | P0 | 5 | none | rule review matrix |
| FP-003 | Synthetic fixture generator | P0 | 3 | FP-002 | deterministic seed + SHA |
| FP-004 | Entity models/migrations | P0 | 5 | FP-001 | clean migrate up/down |
| FP-005 | Snapshot ingest/reconcile | P0 | 5 | FP-004 | mismatch blocks lock |
| FP-006 | Eligibility state model | P0 | 5 | FP-002/004 | unknown fail closed |
| FP-007 | Transfer engine | P0 | 5 | FP-006 | invariants pass |
| FP-008 | Issuance engine | P0 | 5 | FP-006 | ceil boundary cases |
| FP-009 | Rule registry/temporal scope | P0 | 5 | FP-002 | draft cannot certify |
| FP-010 | Scenario compare service | P0 | 3 | FP-007/008 | immutable comparisons |
| FP-011 | Company/snapshot screens | P0 | 5 | FP-005 | error states |
| FP-012 | Simulator UX | P0 | 5 | FP-010/011 | replay fixtures |
| FP-013 | Markdown memo export | P0 | 3 | FP-010 | sources/watermark |
| FP-014 | Golden/property/integration suite | P0 | 8 | FP-003/007/008 | all pass |
| FP-015 | Public sandbox deployment | P0 | 5 | FP-012/014 | isolated synthetic |
| FP-016 | AI PDF candidate extractor | P1 | 8 | FP-005 | schema+review+pages |
| FP-017 | AI discrepancy report | P1 | 5 | FP-016 | seeded conflicts |
| FP-018 | AI memo draft | P1 | 3 | FP-013 | locked results only |
| FP-019 | AI eval harness | P1 | 5 | FP-016 | scorecard |
| FP-020 | Demo video/validation paper | P0 | 3 | FP-015 | ready for outbound |
| FP-021 | Pilot auth/RBAC/tenant | P2 | 8 | security review | cross-tenant tests |
| FP-022 | Pilot storage+data governance | P2 | 8 | DPA/license | signed scans/retention |

## Ticket template
`Problem / user / source / in-scope / dependencies / acceptance (Given-When-Then) / tests / privacy risk / owner / estimation / done evidence`.

## Sequence critical path
FP-002 → FP-006 → FP-007/008 → FP-010 → FP-012 → FP-015 → FP-020. Run FP-014 throughout.
