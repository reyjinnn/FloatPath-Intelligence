# AI Structured Output Schema and Review Contract

AI is only allowed to create **candidates**. All output must be validated server-side and explicitly accepted by a user. Source snippets are *untrusted evidence*, not instructions.

## Candidate extraction JSON (illustrative; not a complete JSON Schema document)
```json
{
  "schema_version":"1.0",
  "document_id":"demo-doc-001",
  "document_type":"SHAREHOLDER_REGISTER",
  "as_of":"2026-03-31",
  "fields":{
    "total_listed_shares":{
      "value":"1000000000",
      "page_number":2,
      "quote":"Total shares: 1,000,000,000",
      "confidence_label":"REQUIRES_REVIEW"
    },
    "reported_free_float_shares":{
      "value":null,
      "page_number":null,
      "quote":null,
      "confidence_label":"NOT_FOUND"
    }
  },
  "warnings":["OWNERSHIP_CLASSIFICATION_NOT_VERIFIED"],
  "review_status":"PENDING_REVIEW"
}
```

## Schema validation
- `additionalProperties=false` for each trusted schema object; schema version required.
- `value` is decimal digit string for share counts, parsed to nonnegative integer with upper-bound controls.
- Date ISO YYYY-MM-DD; `page_number` positive integer bounded by actual PDF page count.
- Quote ≤300 chars and must be matched to normalized page text (minor whitespace normalization permitted).
- If value null, its source page and quote may also be null; absence is expected and valid.
- Confidence is categorical metadata, **not** a model-provided probability of factual truth.

## Review workflow
Candidate → `PENDING_REVIEW` → human `ACCEPTED` / `CORRECTED` / `REJECTED` → authorized snapshot draft. Store reviewer, timestamp, original candidate, corrected value, evidence link, reason. Reject candidates whose citations do not correspond to actual page content.

## Memo assistant contract
- Input from immutable scenario result only; read-only typed data.
- Required sections: executive summary, data date, target being simulated, alternatives, constraints, assumptions, unresolved facts, source references, nonofficial disclaimer.
- Output must not change numbers or invent legal clause citations.
- Memo generation failure must leave deterministic report available.

## Privacy considerations
Only send authorized content to model provider under terms and customer processing agreement; disable private document upload in public demo. Model name/cost parameters controlled by environment configuration, evaluate before selection.
