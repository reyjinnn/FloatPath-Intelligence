# Requirement-to-Test Traceability Matrix

| Requirement | Implementing component | Primary test IDs | Evidence at release |
|---|---|---|---|
| BR-01, FR-001 | Company/Snapshot API & UI | DATA-001, UI-001 | E2E record/screens |
| FR-002 | CSV importer | DATA-001/002, INT-001 | import error fixtures |
| FR-003 | Eligibility evaluator | CALC-005/006/011, SEC-009 | eligibility diff tests |
| FR-004 | Rule assessment | RULE-001/002, CALC-016 | versioned rule outcomes |
| FR-005 | Transfer engine | CALC-002/005/008/015 | golden + property |
| FR-006 | Issuance engine | CALC-003/004/007 | boundary & dilution |
| FR-007 | Comparison | CALC-014, E2E-001 | immutable compare |
| FR-008 | Evidence linking | AI-004/007, INT-002 | click-through source refs |
| FR-009 | Memo export | E2E-002, AI-004 | watermark report |
| FR-010 | AI extraction | AI-001/002/003/005/006/009 | eval scorecard |
| FR-011 | AI explanation | AI-008, AI-010 | no numeric modifications |
| FR-012 | Audit | SEC-002/003, INT-003 | event hashes |
| FR-013 | Auth/RBAC pilot | SEC-001/006 | verified private access |
| FR-014 | Tenant isolation pilot | SEC-004, SEC-001 | cross-tenant penetration tests |

## New tests to implement
`UI-001`: company demo display/empty state. `INT-001`: CSV import/reconciliation. `INT-002`: provenance persisted. `INT-003`: immutable locking. `E2E-001`: scenario comparison. `E2E-002`: report export/watermark. Existing arithmetic & security cases in GOLDEN_TEST_CASES and AI_EVALUATION.

## Coverage discipline
Every approved PRD requirement needs a mapped automated or manual case, build SHA, test run evidence, owner. Pending tests remain NOT RUN, never inferred PASS. If a requirement changes, update this matrix and the acceptance criteria.
