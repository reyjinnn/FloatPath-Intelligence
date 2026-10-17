# Product Requirements Document — MVP v0.1

## Goal
User inputs a dated ownership snapshot, verifies eligibility, simulates scenarios, then exports an evidence-linked **non-official** decision memo.

## Personas
P1 Analyst (build), P2 Reviewer (approve input/report), P3 Demo viewer (synthetic read-only), P4 Admin (pilot only).

## Functional requirements / acceptance criteria
| ID | Feature | Acceptance criteria | Priority |
|---|---|---|---|
| FR-001 | Create synthetic issuer | Required shares>0, unique key, snapshot date, board, explicit demo flag | P0 |
| FR-002 | CSV/manual input | Schema validation, reconciliation sums, errors per row; no silent truncation | P0 |
| FR-003 | Eligibility verification | `ELIGIBLE/INELIGIBLE/UNKNOWN`, reason, verified_by/source; UNKNOWN blocks legal conclusion | P0 |
| FR-004 | Assessment | Rule id/version/date, status, missing facts, numeric results, reproducible inputs | P0 |
| FR-005 | Block sale | Changes owner balances not total; eligibility rechecked after trade; no negatives | P0 |
| FR-006 | New-share issuance | Adds recipient balances & denominator; integer ceil, dilution shown | P0 |
| FR-007 | Compare scenarios | Baseline vs 2+ cases: total, eligible, %, dilution, assumptions, unverified flags | P0 |
| FR-008 | Evidence records | Each result references source & snapshot; missing evidence clearly marked | P0 |
| FR-009 | Memo export | Markdown/PDF future; MVP Markdown or generated HTML; watermark | P0 |
| FR-010 | PDF candidate extraction | Candidate JSON + page refs, review before accept; fallback manual | P1 |
| FR-011 | Explanation via AI | No AI-derived unverified numeric/eligibility assertions | P1 |
| FR-012 | Audit trail | Who/what/when/version + input hash; append-only on finalized cases | P1 |
| FR-013 | Auth/RBAC | Demo read-only; private accounts for pilot | P2 |
| FR-014 | Multi-tenant isolation | Tenant scoped all rows/uploads | P2 |

## Functional rules
- Every financial/regulatory number tagged `input`, `derived`, or `unknown`.
- No assessment if `snapshot.total_listed_shares != sum(all_shareholder_shares)` **unless aggregate buckets are represented and reconciled**.
- Single shareholder crossing an exclusion threshold must trigger **full recomputation**, not simple addition of transferred shares.
- If user toggles any unverified field, recompute candidate scenario only; archived result stays immutable.
- Never infer SID count from number of rows; source must supply exact relevant SID value.

## Critical edge states
No file, zero shares, missing SID, no eligibility evidence, stale baseline, contradicting dates, unknown board applicability, document parsing failure, high concentration, issuer-specific exceptions, unauthorized data.

## UI pages
`/demo` → `/companies/:id` → `/snapshots/:id/verify` → `/assessments/:id` → `/scenarios/new` → `/scenarios/compare` → `/reports/:id`.

## Non-functional
Auditability, 0 high-severity security findings before pilot; financial integers/Decimal; no unlicensed data; time-bound upload processing; logs avoid raw PII; relevant automated tests required.

## Explicit non-goals
Actual placement/rights execution, direct regulatory filing, financial advice, live stock-market feed, automatic compliance certification, full e-RUPS/BAE shareholder portal.

## Release acceptance
See [release gate](../09-quality/RELEASE_GATE.md); open questions in [reference](../12-reference/OPEN_QUESTIONS.md).
