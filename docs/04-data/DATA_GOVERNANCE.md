# Data Governance / Rights / Privacy

## Dataset categories
1. `SYNTHETIC_PUBLIC`: freely reusable demo data created by team.
2. `PUBLIC_EXTERNAL`: public-looking ≠ licensed for commercial republication; require source terms review.
3. `CUSTOMER_CONFIDENTIAL`: customer authorization, defined controller/processor responsibilities, restricted storage.
4. `PERSONAL_DATA`: identify purpose, legal basis, retention, access control, DSR/incident procedures.

## Rules
- IDX terms require written consent for commercial reuse/redistribution of website data and disallow scraping/crawling. See source register; revalidate prior to use.
- No background scraping BEI/KSEI or republishing source documents.
- Every document record stores source, use permission, document date, hash, license basis, expiry, sensitivity.
- Public demo refuses confidential documents; production authorization and procurement security requirements before upload.
- AI data processing: assess supplier terms, processing location, retention, and possible overseas transfer; do not promise zero retention by assumption.
- Enforce per-tenant physical/logical separation and prohibit sharing personal holder names in analytics logs.

## Lifecycle
Source receipt → malware scan → restricted storage → human extraction verification → usage consent/authorization → retention expiry → deletion and deletion audit. Define backup deletion policy separately.

## Minimum contract terms for pilot
Purpose/roles/data ownership, processing instruction, subprocessors, geography, encryption, access grants, incident notification, retention, termination/deletion, warranties/limits, permission to use anonymized metrics, no unauthorized training/reuse.
