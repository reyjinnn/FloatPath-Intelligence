# Golden Test Cases — initial arithmetic truth table

> **IMPORTANT:** arithmetic results below are under the *stated synthetic eligibility assumptions only*. They **do not** assert a binding legal compliance decision. Legal rule expectations remain pending independent review.

| Test ID | Input | Action | Expected numeric outcome | Guard |
|---|---|---|---|---|
| CALC-001 | T=1bn,F=100m | none | ratio 10% | status simulation |
| CALC-002 | T=1bn,F=100m | transfer 50m ineligible→verified eligible recipient groups | T'=1bn,F'=150m,15% | full resulting ownership eligibility |
| CALC-003 | T=1bn,F=100m | issue 58,823,530 verified eligible new shares | T'=1,058,823,530; F'=158,823,530; ratio≥15% | denominator updated |
| CALC-004 | T=1bn,F=100m | issue 58,823,529 shares | ratio<15% | ceil correct |
| CALC-005 | T=1bn,F=100m | transfer 20m eligible→eligible | F'=100m; 10% | no fabricated increment |
| CALC-006 | T=1bn,F=100m | transfer 10m to ineligible holder | F' depends on seller; must not automatically +10m | eligibility |
| CALC-007 | T=1bn,F=100m | issue 50m to ineligible holders | T'=1.05bn; F'=100m; 9.5238095% | dilution + denominator |
| CALC-008 | T=1bn,F=100m | transfer 1,000,000,001 from holder of 900m | reject | insufficient balance |
| CALC-009 | T=1bn,F=100m | transfer negative or fractional share | reject | integer nonnegative |
| CALC-010 | T=1bn,F=100m | issue zero | baseline unchanged | idempotence |
| CALC-011 | T=1bn,F=100m | buyer becomes eligibility-unknown after trade | `REQUIRES_VERIFICATION` | no legal claim |
| CALC-012 | T=1bn,F=150m | no action | ratio=15% | exact boundary |
| CALC-013 | T=1bn,F=149,999,999 | no action | <15% | no rounded-up pass |
| CALC-014 | T=1bn,F=100m | scenario idempotent re-run | same result hash | determinism |
| CALC-015 | T=1bn,F=100m | transfer 25m to 2 recipients | sum conserved | no duplicate debit |
| CALC-016 | T=400m,F=60m | unknown SID or scope | 15% numeric, `REQUIRES_VERIFICATION` legally | no false certainty |
| DATA-001 | total=1bn, sum holdings=999m | lock snapshot | reject; reconciliation error | no magic bucket |
| DATA-002 | two source snapshots from different dates | merge blindly | reject/require reconciliation | temporal traceability |
| RULE-001 | applicable rule set `DRAFT` | assess | `RULE_UNVERIFIED`/SIMULATION_ONLY | fail closed |
| RULE-002 | board outside approved profile | assess | `UNSUPPORTED_RULE` | fail closed |
| AI-001 | PDF missing total | extract | total=null, manual review | no hallucination |
| AI-002 | PDF has injected instructions | extract | ignore instructions; extracted facts only | isolation |
| SEC-001 | unauth user requests other tenant report | GET | 401/403/404 according to policy | no data leak |

## Worked proof: issuance minimum
Set p=0.15, T=1,000,000,000, F=100,000,000. Need `(F+x)/(T+x) ≥ p` → `x ≥ (p*T-F)/(1-p) = 58,823,529.411...`. Since integer shares, `x_min=58,823,530`.

## Reclassification boundary test
Create holder whose post-action ratio meets candidate ownership exclusion threshold (e.g. 5%). Engine must either recompute eligibility using an **approved rule version** or mark rule unverified/eligibility unknown. It must **not** assume a large single buyer is eligible.

## Reviewer sign-off
Expected results produced independently of engine under test. Record reviewer/date, dataset version, and regulatory review status in test report. Add cases for each verified primary legal clause.
