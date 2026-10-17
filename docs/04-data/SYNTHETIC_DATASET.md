# Synthetic Dataset & Fixtures Plan

## Rule
Never use personal identities or Datindo client secrets. Generated data names must clearly indicate `DEMO`. Do not brand as a real issuer or claim real capitalization. The sample cases below are arithmetic demonstrations, not a reproduction of legally validated rule outcomes.

## Seed companies
| ID | Total shares | Baseline eligible | Ratio | Scenario |
|---|---:|---:|---:|---|
| DEMO-001 | 1,000,000,000 | 100,000,000 | 10% | 15% target arithmetic |
| DEMO-002 | 1,000,000,000 | 170,000,000 | 17% | Numerically above target; other criteria unknown |
| DEMO-003 | 1,000,000,000 | 120,000,000 | 12% | Affiliation unknown; needs review |
| DEMO-004 | 1,000,000,000 | 140,000,000 | 14% | New issuance denominator test |
| DEMO-005 | 400,000,000 | 60,000,000 | 15% | SID missing; no legal conclusion |

## Representative DEMO-001 ledger
- `CTRL-1`: 850,000,000; marked ineligible by synthetic assumption.
- `ELIGIBLE-BUCKET`: 100,000,000; synthetic aggregate of multiple eligible holders, verified in fixture.
- `TRANSFER-SELLER`: 50,000,000; marked ineligible in base.
- Total: 1,000,000,000.
- If 50,000,000 transferred to **multiple eligible recipients whose resulting ownership remains under relevant exclusion thresholds and all flags are verified**, eligible = 150,000,000; otherwise do **not** mark achieved.

## PDF fixtures
`synthetic_basic.pdf`, `synthetic_missing_float.pdf`, `synthetic_conflict_total.pdf`, `synthetic_scanned.pdf`, `synthetic_prompt_injection.pdf` (generated only with synthetic names) for extraction evaluation.

## CSV fixture fields
`holder_ref,shares,controller_flag,affiliate_flag,board_member_flag,treasury_flag,restricted_flag,eligibility,evidence_ref`.

## Fixture generation steps
Use deterministic random seed and immutable fixture version; create synthetic ownership ledger; reconcile to total; generate CSV/PDF sources; independently compute expected numeric outputs; obtain second reviewer sign-off; snapshot fixture SHA-256; prevent fixtures auto-updating test expectations.

## Test scenarios
Include zero/negative shares, overflow, duplicate IDs, unknown flags, percent rounding boundary, transfers to ineligible holder, eligible-to-eligible transfer, threshold-crossing receiver, 2 issuances, rollback, stale/asymmetric source dates, cash estimate with decimal price, maximum safe share-counts.
