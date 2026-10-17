# AI Evaluation Dataset & Scorecard

## Objective
Prove AI assists document extraction and memo drafting **without** becoming authoritative evidence or calculation engine. Test on synthetic documents and legally permitted source materials.

## Dataset design
| Split | Suggested count | Content |
|---|---:|---|
| Development | 15 | clean synthetic PDFs, multiple layouts, zeros/missing |
| Holdout | 10 | different templates, conflicting numbers, scanned pages if parser supports |
| Adversarial | 10 | embedded instructions, malformed tables, confusing footnotes, mismatched dates |

Counts are starting targets, not benchmark evidence. Sample documents must be versioned and include human-labeled gold spans/pages and expected nulls.

## Metrics
- Exact-match precision/recall/F1 per numeric field, grouped by document template and layout.
- Citation correctness = supporting page/span exists and logically supports extracted value.
- False-assertion rate when ground truth field absent (must be **zero critical fabricated financial facts** in release gate).
- Mandatory-review adherence: no candidate promoted without user action.
- Memo numeric consistency: zero changed immutable numbers; missing-fact disclosure coverage.
- Latency p50/p95, error, retry, approximate cost by doc.

## Sample scorecard record
`case_id | template | field | expected | predicted | page_expected | page_predicted | quote_valid | error_severity | reviewer_notes`.

## Acceptance for public demo
- All schema outputs valid after bounded retries or safely fail to manual input.
- Every output includes review status and source citation validation.
- Zero accepted prompt injections in adversarial tests.
- Publish **measured** metrics with sample sizes; do not invent 95% success before testing.

## Regression process
Pin dataset version and model config; rerun when changing prompt, model, OCR/parser, extraction schema, or document processing code. Keep manual fallback independent from AI availability.
