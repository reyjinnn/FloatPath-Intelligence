# Data Provenance, Versioning, and Trust Levels

## Trust levels
- `SYNTHETIC`: generated fixture, safe public demo; never make real issuer claim.
- `USER_ENTERED_UNVERIFIED`: manual input, source/evidence absent or unreviewed.
- `DOCUMENT_EXTRACTED_CANDIDATE`: AI/OCR output; cannot become trusted silently.
- `USER_VERIFIED`: user reviewed source and corrected values; still not legally certified.
- `INDEPENDENTLY_REVIEWED`: designated reviewer checked evidence and rule scope.

## Provenance chain
`source_document → extraction_candidate → verified_data_field → locked_snapshot → rule_version → scenario_input → calculation_result → memo_version`.
Every link has stable IDs, timestamp, content hash, actor type, and optional reviewer.

## Immutable snapshot policy
Locked snapshots cannot be edited. New corrections fork a snapshot with `supersedes_snapshot_id`, a delta reason, and evidence. Scenario is bound to exactly one locked snapshot and rule hash. Regenerating a report against new data creates a **new** report version.

## Example persisted metadata
```json
{
  "snapshot_id":"DEMO-SNAP-001",
  "as_of":"2026-03-31",
  "source_trust":"SYNTHETIC",
  "parent_snapshot_id":null,
  "content_hash":"sha256:<computed-by-service>",
  "rule_profile_id":"DEMO_NUMERIC_15",
  "rule_profile_status":"DRAFT",
  "verified_by":null,
  "locked_at":"2026-10-17T00:00:00Z"
}
```

## Reproducibility requirements
Use canonical JSON with stable ordering and integer shares, ISO UTC timestamps for events, Decimal string serialization for money and ratios, hash of rule source and code version. A scenario result hash depends on normalized inputs/rule/engine version, **not** on created_at or request_id.

## Data licensing
Store `rights_basis`, `permitted_use`, `source_owner`, `license_expiry`, `retention_period`, and `review_status` for each real dataset; absent evidence → no public redistribution or automated scraping.
