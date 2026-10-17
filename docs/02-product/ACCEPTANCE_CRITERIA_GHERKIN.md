# Cross-Feature Acceptance Criteria (Given/When/Then)

## US-001 — Create snapshot
**Given** a demo issuer with T=1,000,000,000, **when** the analyst enters holdings totaling T, **then** the snapshot may be locked if all required fields/permissions are satisfied. **When** holdings total 999,999,999, **then** lock is rejected with a reconciliation error. No implicit 'others' bucket.

## US-002 — Unknown eligibility
**Given** an ownership record with `UNKNOWN` controller-affiliation, **when** the analyst runs assessment, **then** the system yields `REQUIRES_VERIFICATION` and a list of needed facts. It must not produce `COMPLIANT`.

## US-003 — Transfer
**Given** a valid T=1bn F=100m synthetic snapshot, **when** verified ineligible seller transfers 50m to **separate verified eligible holders** whose resulting classifications remain eligible, **then** post-state T=1bn F=150m, ratio exactly 15%. **And** an audit event records immutable assumptions.

## US-004 — Issuance rounding
**Given** T=1bn F=100m, **when** 58,823,529 eligible shares are issued, **then** target remains unmet. **When** 58,823,530 are issued, **then** resulting ratio reaches/exceeds 15% with new denominator.

## US-005 — Holder crosses exclusion boundary
**Given** a buyer whose combined position crosses a rule-specified exclusion threshold, **when** a transfer is simulated, **then** the engine recomputes buyer classification using a verified rule, or returns `REQUIRES_VERIFICATION` if it cannot.

## US-006 — AI output review
**Given** a PDF candidate with extracted total and page reference, **when** the user rejects or edits it, **then** no trusted snapshot is modified without explicit confirmation; corrections and source are recorded.

## US-007 — Deterministic result stability
**Given** fixed snapshot hash, rule hash, scenario input and engine version, **when** the same scenario is re-run, **then** canonical normalized result and result hash match.

## US-008 — Permission boundary
**Given** a public demo viewer, **when** private tenant API is requested, **then** access is denied without revealing private record existence or data.

## US-009 — Fallback without AI
**Given** OpenAI API is down, **when** analyst enters CSV/manual data, **then** assessment/simulations and deterministic report still operate.

## US-010 — Report caveat
**Given** non-approved rule status, **when** report exports, **then** `SIMULATION_ONLY` disclaimer, missing evidence, source date, and rule version appear in every generated report.
