# Property-Based and Metamorphic Test Strategy

Tooling proposal: `pytest` + `hypothesis`, `Decimal` and exact integer comparisons.

## Properties (generative)
| ID | Property | How to assert |
|---|---|---|
| PROP-001 | Transfer conserves T | `sum(post.holdings)==sum(pre.holdings)` |
| PROP-002 | Issuance grows T exactly | `T_post == T_pre + sum(allocations)` |
| PROP-003 | No negative holder shares | all holdings >=0 |
| PROP-004 | No hidden new shares on transfer | `T_post==T_pre` |
| PROP-005 | Noneligible issuance cannot be assumed F+ | full recomputation or UNKNOWN |
| PROP-006 | Unknown facts never give certified pass | output status never `COMPLIANT` |
| PROP-007 | Determinism | fixed inputs/profile/version -> same normalized result hash |
| PROP-008 | Re-running simulation does not mutate source | baseline snapshot hash unchanged |
| PROP-009 | Target boundary exactness | `b*F>=a*T`, no rounding false positives |
| PROP-010 | Shareholding ledger reconciles after transactions | `sum(holders)==T_post` |
| PROP-011 | Transfers between verified eligible holders preserve F if both remain eligible | F_post=F_pre |
| PROP-012 | Reclassification may reduce F | handle ratio threshold crossing without monotonicity assumption |

## Generators
- Choose 2–200 holders; total shares between 1 and 10^12, partition via deterministic integer partition generator.
- Separate factual eligibility from verified rule outcomes; if facts insufficient, expect unknown.
- Generate transfer amounts 0..seller shares+1 (invalid cases included).
- Generate single and multi-recipient issuance with one recipient potentially crossing rule threshold.
- Generate snapshot dates/rule versions including unsupported, expired, overlapping.

## Metamorphic cases
- Permuting holder row order must not change result.
- Same semantic allocation represented in shuffled input order must yield same canonical hash.
- Renaming synthetic display labels without modifying stable IDs may not alter calculations.
- Adding a zero-share holder should have no arithmetic effect (unless a verified holder/SID rule explicitly applies).

## Safety and reporting
Keep seeds and failing fixtures; shrink and export any counterexample as JSON. Every property failure blocks merge of engine code. Report legal-profile-dependent properties separately from pure arithmetic properties.
