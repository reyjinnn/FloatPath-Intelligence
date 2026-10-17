# REST API Contract — draft v0.1

Base `/api/v1`; JSON UTF-8; camelCase for public fields or snake_case **choose one, document and enforce**. Current proposal uses `snake_case`. UUID resources. Standard errors per RFC 9457/problem+json style. Idempotency-Key for mutating async/import requests; correlation ID in all responses.

## Endpoints
| Method | Route | Purpose | Role |
|---|---|---|---|
| GET | `/health` | liveness/readiness (minimal) | public monitor |
| GET | `/demo/companies` | synthetic-only catalog | demo |
| POST | `/companies` | create issuer | analyst |
| GET | `/companies/{id}` | detail | analyst |
| POST | `/companies/{id}/snapshots` | draft snapshot | analyst |
| POST | `/snapshots/{id}/holdings:import` | CSV/manual records | analyst |
| POST | `/snapshots/{id}:validate` | sum & schema check | analyst |
| POST | `/snapshots/{id}:lock` | reviewer approval | reviewer |
| POST | `/snapshots/{id}/assessments` | selected rule assessment | analyst |
| POST | `/snapshots/{id}/scenarios` | apply typed action | analyst |
| GET | `/scenarios/{id}/result` | deterministic result | analyst |
| POST | `/scenario-comparisons` | compare immutable results | analyst |
| POST | `/documents` | signed upload start (pilot only) | analyst |
| POST | `/documents/{id}:extract` | AI candidate extraction | analyst |
| POST | `/extractions/{id}:approve` | human approve | reviewer |
| POST | `/reports` | memo generation | analyst |
| GET | `/reports/{id}` | read/report download | authorized |
| GET | `/rulesets` | scope and review status | analyst |

## Example request — new issuance
```json
{
  "snapshot_id":"00000000-0000-4000-8000-000000000001",
  "rule_set_id":"demo-2026-15pct",
  "action_type":"NEW_ISSUANCE",
  "allocations":[
    {"holder_ref":"DEMO-NEW-A","shares":30000000,"verified_eligible":true},
    {"holder_ref":"DEMO-NEW-B","shares":28823530,"verified_eligible":true}
  ],
  "price_idr_per_share":"250.00",
  "notes":"Synthetic; resulting-holder eligibility must be recalculated"
}
```

## Example response (candidate arithmetic)
```json
{
  "scenario_id":"11111111-1111-4111-8111-111111111111",
  "input_hash":"sha256:...",
  "rule_version":"demo-2026-15pct",
  "total_shares_after":1058823530,
  "free_float_shares_after":158823530,
  "free_float_ratio":"0.1500000004",
  "numeric_target_status":"PASS_NUMERIC",
  "assessment_status":"SIMULATION_ONLY",
  "warnings":["NOT_A_LEGAL_COMPLIANCE_DETERMINATION"]
}
```

## Error model
```json
{
  "type":"https://floatpath.example/errors/eligibility-unknown",
  "title":"Eligibility requires verification",
  "status":422,
  "code":"ELIGIBILITY_UNKNOWN",
  "detail":"Result cannot be presented as verified",
  "field_errors":[{"field":"allocations[0].verified_eligible","message":"missing supporting evidence"}],
  "correlation_id":"req_..."
}
```

## Rules
- API never accepts a client-supplied `free_float_ratio` as a trusted computed value.
- Calculate server-side from ledger. All accounts in JWT tenant; never trust URL alone.
- `GET /demo/*` cannot enumerate private company IDs, and private endpoints inaccessible unauthenticated.
- For import, `202 Accepted` with processing status when asynchronous; uploads require scanning, bounded size/MIME.
- Pagination max 100 by default; explicit version headers on breaking changes.

## TODO before implementation
Generate actual OpenAPI 3.1 spec from FastAPI and check schema diffs in CI; auth/permissions matrix, response paging, request examples, schema validation, failure codes.
