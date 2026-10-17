# End-to-End Scenarios with Expected Results

## E2E-001 — Public synthetic happy path
Given DEMO-001, open /demo → select issuer → inspect reconciled snapshot → run block transfer scenario with verified eligible recipient set → compare with baseline → export memo. Expect exact ratio, immutable source refs, SIMULATION_ONLY watermark, no real client data.

## E2E-002 — New share issuance boundary
Given 1bn total/100m eligible baseline; issue 58,823,529 verified eligible shares; target still below 15%. Issue 58,823,530; target reaches/exceeds 15%, denominator increases, dilution shown.

## E2E-003 — Data mismatch
CSV holdings sum differs from total by one share. Expect row summary/reconciliation error, lock disabled, no assessment.

## E2E-004 — Missing controller verification
Upload/enter incomplete affiliation status. Expect `REQUIRES_VERIFICATION`, list evidence needed, no certified compliance verdict.

## E2E-005 — Eligible buyer becomes ineligible
Simulate a transfer causing buyer to cross an applicable verified exclusion threshold. Expect full post-state reclassification or explicit unknown if rule profile unverified; no additive shortcut.

## E2E-006 — AI outage fallback
Disable provider credentials, upload processing unavailable. Expect manual CSV pipeline, deterministic simulation and report to remain functional; AI unavailable indicated.

## E2E-007 — Prompt injection document
Parse synthetic PDF with hostile instructions. Expect schema-only extraction; no exfiltration, no policy changes, candidate must be reviewed.

## E2E-008 — Historical report reproducibility
Run scenario, save report/hash, modify a draft copy or change current rule draft. Existing report must retain original snapshot hash and rule version.

## E2E-009 — Unsupported board and time scope
Select board/time not covered by approved rule. Expect `UNSUPPORTED_RULE`, numerical demo only, not certified status.

## E2E-010 — Tenant isolation (pilot)
Authenticated tenant A user requests tenant B result ID. Expect denial and zero leaked data; audit records event.

## Actual result entry template
`Case ID | Build/Commit | Test data version | Rule version | Expected | Actual | Pass/Fail/Blocked | Evidence | Bug ID | Tester/time`.

All Pass results require executed evidence. Not Run must not be promoted to Pass.
