# Contributing & Engineering Workflow

## Branch strategy
`main` protected and release-ready; `development` optional integration; feature branches `feat/FP-007-transfer-engine`, fixes `fix/FP-###`.

## PR template content
Problem/requirement IDs, proposed behavior, before/after examples, risk to financial computation, affected source/rule version, test plan/output, privacy and data licensing review, screenshots when UI changes.

## Code quality
Python: typed functions, Pydantic schemas, Ruff/formatter, Pytest + property tests; TypeScript strict mode, ESLint, typed API client, Playwright E2E. Use dependency lock files; no generated code changes without schema diff. Add logging correlation IDs; redact sensitive values.

## Review gates
- Any formulas, classifications, rounding, rule date changes require domain test reviewer.
- Any upload/AI/tenant/credentials changes require security review.
- No merged failures of golden suite, API contract tests or secret scanning.
- Explicit migration and rollback plan for schema changes.

## Commit examples
`feat(engine): recalculate eligibility after issuance`; `test(golden): add boundary for candidate threshold`; `docs(regulatory): mark board-specific rule unverified`.

## Definition of done
[See document](docs/00-governance/DEFINITION_OF_DONE.md).
