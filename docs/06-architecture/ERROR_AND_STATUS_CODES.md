# Error & Status Codes

## Snapshot state
`DRAFT` → `PENDING_REVIEW` → `VERIFIED` → `LOCKED`; rejected review back to draft *new revision*; locked immutable.

## Data issue codes
`DATA_RECONCILIATION_FAILED`, `INVALID_SHARE_COUNT`, `DUPLICATE_HOLDER`, `DATE_MISMATCH`, `SID_UNVERIFIED`, `OWNERSHIP_CLASSIFICATION_UNKNOWN`, `DOCUMENT_SOURCE_MISSING`, `DATA_LICENSE_UNCONFIRMED`.

## Scenario codes
`INSUFFICIENT_SELLER_BALANCE`, `NEGATIVE_ISSUANCE`, `NON_INTEGER_SHARES`, `UNKNOWN_RECIPIENT_ELIGIBILITY`, `ELIGIBILITY_CHANGED_AFTER_ACTION`, `UNSUPPORTED_SHARE_CLASS`, `ARITHMETIC_OVERFLOW`, `INVALID_TARGET_RATE`.

## Rule codes
`RULE_UNVERIFIED`, `RULE_VERSION_NOT_FOUND`, `RULE_SCOPE_AMBIGUOUS`, `UNSUPPORTED_BOARD`, `RULE_EFFECTIVE_DATE_MISMATCH`, `ISSUER_EXCEPTION_UNVERIFIED`.

## Assessment statuses
- `PASS_NUMERIC`: a specific **numeric** predicate passed under verified assumptions.
- `FAIL_NUMERIC`: predicate failed numerically.
- `REQUIRES_VERIFICATION`: material factual eligibility/source unknown.
- `UNSUPPORTED_RULE`: scope outside approved engine rules.
- `SIMULATION_ONLY`: default demo aggregate marker, never legal certificate.
- `LEGAL_CONCLUSION_UNAVAILABLE`: legal rule coverage insufficient or reviewer not approved.

## API HTTP mapping (proposed)
400 bad JSON, 401 unauthenticated, 403 forbidden, 404 absent/inaccessible per policy, 409 immutable/version conflict, 413 oversized doc, 422 invalid data/unknown eligibility, 429 quota, 500 unexpected error (sanitized), 503 AI/provider unavailable (manual fallback).

## UX requirements
Never hide unknown status behind green; error message must state corrective action and supporting context, use short support code and correlation ID.
