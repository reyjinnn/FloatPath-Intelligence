# Coding Agent Handoff — Precise Execution Contract

> This is a pre-development pack. Do not assume source code, database or successful tests exist. The coding agent must confirm actual files and execute tests before claiming Pass.

## Mandatory reading sequence
1. `../../AGENTS.md` and `../../START_HERE.md`.
2. `../03-regulatory/REGULATORY_SPEC.md`, `../03-regulatory/RULE_TO_CODE_TRACEABILITY.md` and source register.
3. `../04-data/DATA_DICTIONARY.md`, `../04-data/CSV_IMPORT_CONTRACT.md`, `../04-data/PROVENANCE_AND_DATA_VERSIONING.md`.
4. `../05-engine/SIMULATION_SPEC.md`, `../05-engine/ENGINE_INTERFACE_AND_PSEUDOCODE.md`, `../09-quality/GOLDEN_TEST_CASES.md`.
5. `../06-architecture/ARCHITECTURE.md`, `../06-architecture/DATABASE_DESIGN.md`, `../06-architecture/API_CONTRACT.md`.
6. `../02-product/PRD.md`, `../02-product/SCREEN_BY_SCREEN_SPEC.md`, `../09-quality/E2E_SCENARIOS.md`.

## Explicit agent system boundaries
- Use deterministic source code for all authoritative calculations; LLM output cannot change computed numeric values.
- Keep `ELIGIBLE`, `INELIGIBLE`, `UNKNOWN` and `SIMULATION_ONLY` visible end-to-end.
- Never claim verification of unreviewed legal rules. Build `DEMO_NUMERIC_15` profile with explicit disclaimer.
- Public sandbox uses synthetic fixtures exclusively, with no external BEI/KSEI scraping.
- Do not execute trades, send regulatory reports, or generate investment recommendations.
- Never fabricate benchmark results or Test Pass statuses; run real commands and attach evidence.

## Milestone 0: repository bootstrap
Implement directories `apps/web`, `apps/api`, `packages/engine` (logical package; may physically live in Python module), `tests`, `datasets/synthetic`, `infra`.
Deliver `.env.example`, dependency lockfiles, Docker Compose, `/health` endpoint, minimal UI, CI and README. Acceptance: clean local setup and no secrets committed.

## Milestone 1: pure engine
Implement strict models and pure functions: `validate_snapshot`, `apply_transfer`, `apply_issuance`, `recompute_eligibility`, `assess_numeric_target`. Write tests *before* API. Immutable baseline; reject invalid actions and unknown eligibility. Validate exact boundaries and invariant cases. Acceptance: all independent golden tests pass.

## Milestone 2: persistence/API
Create migrations; import staging with reconciliation, immutable snapshot lock, scenarios and results keyed by ruleset and snapshot hashes, stable error contract. Acceptance: integration tests from CSV to report including bad data.

## Milestone 3: UI
Implement seven screens from screen specification, preview diffs, calculator controls, evidence views, nonofficial report, accessible error states. Acceptance: Playwright smoke tests and human demo review.

## Milestone 4: assistive AI (optional until earlier gates pass)
Add schema-bound extraction, citation validation, manual accept/correct/reject, AI memo that consumes read-only deterministic results. Acceptance: adversarial cases, no auto-verification, manual fallback.

## Milestone 5: release
Run `CI_CD_AND_QUALITY_GATES.md` plus security test matrix. Deploy public synthetic sandbox and record demo with no login.

## Every task must output
`Implemented files`, `requirements addressed`, `tests executed and actual results`, `known limitations`, `rule/legal review status`, `next blocking item`.

## Definition of failed work
- Inferring eligible free float from public label alone without verified rule and ownership facts.
- Committing fake production data or unrestricted API credentials.
- Counting fractional shares, rounding 14.999999% to 15% as pass.
- Using AI to provide an unverified compliance verdict.
- Introducing microservices or infrastructure complexity without evidence of need.
