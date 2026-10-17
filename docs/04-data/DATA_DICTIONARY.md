# Data Dictionary / Schema Conventions

## Global conventions
Times RFC3339 UTC with explicit source local timezone; dates ISO `YYYY-MM-DD`; shares integer nonnegative; IDR money `DECIMAL(28,2)` (not JS float); rates `DECIMAL(18,10)`; immutable version IDs; user-visible timezone Asia/Jakarta.

## `company`
`id:uuid`, `legal_name:string`, `ticker:string?`, `board:enum`, `market:string`, `demo:boolean`, `created_at`.

## `ownership_snapshot`
`id:uuid`, `company_id`, `as_of_date`, `total_listed_shares:int64(>0)`, `free_float_reported:int64?`, `sid_count:int?`, `market_cap_reference:decimal?`, `reference_date:date?`, `source_type: SYNTHETIC|USER_UPLOAD|AUTHORIZED_API`, `status: DRAFT|PENDING_REVIEW|VERIFIED|LOCKED`, `revision:int`, `content_hash`.

## `holder_allocation`
`id`, `snapshot_id`, `holder_ref`, `shares:int64`, `controller_flag:TRUE|FALSE|UNKNOWN`, `affiliate_flag`, `board_member_flag`, `treasury_flag`, `restricted_flag`, `concentration_status`, `eligibility: ELIGIBLE|INELIGIBLE|UNKNOWN`, `eligibility_reason:code[]`, `verified_by`, `source_ref`.

## `source_document`
`id`, `tenant_id?`, `origin_name`, `sha256`, `mime_type`, `bytes`, `as_of_date?`, `storage_key`, `license_basis`, `confidentiality:SYNTHETIC|INTERNAL|RESTRICTED`, `scan_status`, `retention_until`.

## `extracted_field`
`id`, `document_id`, `field_name`, `raw_value`, `normalized_value`, `page_number`, `bounding_ref?`, `confidence?`, `model_version`, `state:CANDIDATE|ACCEPTED|REJECTED`, `reviewed_by`, `reviewed_at`.

## `rule_set`
`id`, `version`, `effective_date`, `scope`, `primary_source`, `source_clause`, `status:DRAFT|VERIFIED|RETIRED`, `reviewed_by`, `content_hash`.

## `scenario`
`id`, `base_snapshot_id`, `action_type:TRANSFER|NEW_ISSUANCE`, `allocations`, `price_assumption?`, `assumptions`, `created_by`, `created_at`, `status:DRAFT|LOCKED`.

## `scenario_result`
`id`, `scenario_id`, `input_hash`, `rule_set_id`, `total_after`, `eligible_after`, `ratio`, `dilution_by_holder`, `warnings[]`, `numeric_target_status`, `assessment_status`, `created_at`.

## `report` / `audit_event`
`report`: title, scenario_ids, markdown_content, watermark, sources, creator/reviewer, version.  
`audit_event`: actor, tenant, action, resource, timestamp, previous_hash, new_hash, correlation_id, redacted_metadata.

## Data lineage
`document → extracted candidate → human-approved snapshot → locked scenario → result(+rule version) → memo`. No direct `document → compliance certified` path.

## Reconciliation
All allocation row shares sum exactly to snapshot `total_listed_shares` (aggregate synthetic anonymous buckets allowed). Missing balance, duplicate row, or negative value → block lock. SID count is separate verified measurement, **not** length of rows.
