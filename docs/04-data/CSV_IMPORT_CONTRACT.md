# CSV Import Contract v0.1 — Synthetic/BYOD

## Import rules
- UTF-8 CSV with header; comma as delimiter; `share_count` is nonnegative integer without thousands separator.
- Max MVP file size 5 MB, max 10,000 rows, max 200 chars for display names. Limits are proposed and configurable.
- ISO-8601 date and snapshot ID must match owning issuer.
- Unknown classifications are allowed as `UNKNOWN` but block final numerical conclusions when they affect eligibility.
- All free-text display cells are escaped to prevent spreadsheet/formula injection (`=`, `+`, `-`, `@`) on export.

## `shareholdings.csv`
```csv
holder_ref,holder_type,share_count,controller,controller_affiliate,director_commissioner,treasury,restricted,eligibility_state,evidence_ref
DEMO-H1,ORGANIZATION,900000000,TRUE,FALSE,FALSE,FALSE,FALSE,INELIGIBLE,fixture://demo-001/holder1
DEMO-H2,AGGREGATE,100000000,FALSE,FALSE,FALSE,FALSE,FALSE,ELIGIBLE,fixture://demo-001/holder2
```

The `AGGREGATE` holder is a special *synthetic model* bucket, never a real person's identity or a guarantee of free-float classification. If aggregate detail is insufficient for transaction eligibility, return `REQUIRES_VERIFICATION`.

## Header and schema
| Field | Required | Constraints |
|---|---|---|
| holder_ref | Y | Unique within snapshot, ≤64 char |
| holder_type | Y | PERSON/ORGANIZATION/AGGREGATE |
| share_count | Y | integer ≥0 |
| controller, controller_affiliate, director_commissioner, treasury, restricted | Y | TRUE/FALSE/UNKNOWN |
| eligibility_state | Y | ELIGIBLE/INELIGIBLE/UNKNOWN |
| evidence_ref | Y | `fixture://` or authorized document ID; no arbitrary fetch |

## Validation failures
`CSV_MISSING_COLUMN`, `CSV_INVALID_INTEGER`, `CSV_DUPLICATE_HOLDER`, `CSV_UNTRUSTED_FORMULA`, `CSV_FILE_TOO_LARGE`, `SNAPSHOT_RECONCILIATION_FAILED`, `ELIGIBILITY_CONFLICT`.

## Import lifecycle
1. File quarantined & MIME/content validated.
2. Rows parsed into draft staging, never overwriting locked snapshot.
3. Validate, normalize identifiers, and reconcile holdings against total shares.
4. User previews diff and confirms; audit event stores checksum, import status and row counts.
5. Rejected imports log diagnostics without retaining personal data unnecessarily.
