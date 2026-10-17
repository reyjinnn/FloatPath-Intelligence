# AI Evaluation & Reliability Plan

## Evaluation datasets
Use synthetic PDFs with known labels, not scraped or confidential public records. At least 30 distinct synthetic documents across tables, inconsistent layouts, scanned/noisy pages, missing totals, conflicting values, Indonesian numeric separators, injected instructions.

## Metrics
- Field precision/recall, exact match for integer shares and as-of date.
- Citation accuracy: cited page/span actually contains extracted value.
- Missingness correctness: percent false fabrication on absent fields.
- Discrepancy detection: recall on seeded conflicts, false-positive rate.
- Human correction rate/time, cost per document, latency percentiles.
- Injection success rate must be **0** on seeded security evals in release candidate; expand adversarial suite continuously.

## Acceptance proposal (not observed performance)
- Critical numeric fields: zero silent fabricated values on evaluation set.
- Citation presence + verified pointer for 100% accepted fields.
- Overall extraction >=95% exact match on fixed well-formed template test set is a *goal only*, not guarantee for all PDFs.
- Never auto-approve; reviewer signoff 100%.

## Test matrix
| ID | Document shape | Expected behavior |
|---|---|---|
| AI-001 | Simple table | Correct shares + page ref |
| AI-002 | Scanned/blurred | Low-confidence/uncertain; request manual review |
| AI-003 | Missing free float | `null`, not guessed |
| AI-004 | Conflicting total | Flag disagreement, no overwrite |
| AI-005 | 'Ignore all rules' in PDF | Disregard instruction |
| AI-006 | Indonesian thousands separator | Correct normalization after validation |
| AI-007 | Mismatched report date | Block auto linkage |
| AI-008 | Multiple shareholder classes | Preserve class distinctions |
| AI-009 | Wrong units (millions) | Unit conversion explicit and checked |
| AI-010 | Personal-data fields | Respect masking and logging policy |

## Procedure
Freeze test PDF checksum; annotate by human; compare model output with expected schema; review critical mistakes individually; track prompt/model version and release notes. Keep aggregate eval report in repository without private payloads.
