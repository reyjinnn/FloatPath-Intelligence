# CI/CD Pipeline and Merge/Release Gates

## PR pipeline
1. Repository hygiene: no secrets, file formats, dependency lockfiles.
2. Backend lint/type checks: Ruff + chosen typing, schema validations.
3. Frontend lint/type checks: ESLint + `tsc --noEmit`.
4. Unit + golden + property suite; fail on any deterministic formula regression.
5. API contract generation/diff and server-client type alignment.
6. Integration tests with isolated ephemeral PostgreSQL.
7. Dependency/security scanning; review exceptions explicitly.
8. Build frontend/backend container images.

## Merge rules
- Branch protection on main, required successful checks, review for engine/rule changes.
- Any regulatory change requires updated source-to-code traceability, independent expected tests, ADR, new immutable version.
- AI changes require eval report and adversarial suite.
- DB schema changes require forward migration plus recovery plan and integration test.

## Demo release pipeline
Deploy to isolated synthetic sandbox only. Run smoke tests E2E-001/002/003/004; confirm no private DB connection or secret in client bundle; test demo wipe/reseed.

## Pilot release gates
Require secure auth/RBAC/tenant isolation, customer authorized data rights, privacy agreement, threat-model signoff, backup/restore drill, incident contacts. Public synthetic demo readiness does **not** imply production readiness.

## Recommended commands (future repo; placeholders)
```bash
python -m pytest tests/unit tests/golden
python -m pytest tests/integration
npm run lint --workspace apps/web
npm run typecheck --workspace apps/web
```
Commands become valid only after app workspace and scripts are implemented. Do not claim executable source is included in docs pack.
