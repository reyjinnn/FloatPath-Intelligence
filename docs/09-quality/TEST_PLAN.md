# Master Test Plan — Functional + Nonfunctional

## Strategy
Golden arithmetic tests independent of implementation; property-based invariants; API integration; UI E2E; AI evaluation; multi-tenant abuse/security testing before pilot. All defects linked to requirement IDs.

## Test environment
Synthetic-only dataset with stable version + hash, fixed rule profile, no external AI call for deterministic tests. Staging network and storage separated from production pilot.

## Test layers
1. **Unit:** ratios, ceilings, transfer invariants, issuance, eligibility classification.
2. **Property-based:** random legal share ledgers; conservation and non-negativity; no division-by-zero; idempotent unchanged scenarios.
3. **Integration:** import–review–lock–calculate–report + transaction rollback.
4. **E2E:** browser user flows, invalid inputs, comparison/export and reload.
5. **Security:** IDOR, cross-tenant, file injection, rate limit, CSRF/session.
6. **AI eval:** field extraction, missingness, source, adversarial docs.

## Exit criteria
- 100% tests in signed golden suite correct.
- 0 blocker/critical defects, 0 known cross-tenant leaks.
- 0 unapproved rule claimed as definitive legal compliance.
- All MVP user stories have tested acceptance criteria.
- Human review state enforced and documented.
- Demo can reset without persisting other users' changes.

## Defect severity
`BLOCKER`: wrong legal certainty, incorrect basic shares accounting, private data leak. `HIGH`: silent data loss/corrupt report. `MEDIUM`: recoverable inaccurate hint/UX. `LOW`: cosmetic issue.

## Test report record
Build SHA, ruleset hash, fixture SHA, run time, environment, totals PASS/FAIL/BLOCKED, defect links, reviewer, residual risks, GO/NO-GO.
