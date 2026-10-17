# Preliminary Privacy Impact Assessment (PIA) — Planning Draft

> This is a scoping worksheet, not a legal determination or completed DPIA.

## Processing inventory
**Demo:** only generated company/holder labels, no identifiable real persons.  
**Pilot:** potential names, holdings, affiliations, source documents, email/account details, reviewer activity and AI vendor processing; may include personal and commercially sensitive information.

## Data flow classification
Customer upload → virus scan → private object storage → controlled extraction → reviewer → encrypted relational records → report → retention/deletion; optional API processor involves separate subprocessor/data-transfer review.

## Open risk questions
- What lawful basis and permitted purpose does each user/tenant have for holder data?
- Who is controller/processor for each deployment? Who can exercise data-subject rights?
- Can clients prohibit third-party AI processing or require in-environment models?
- Where is data stored/transmitted and how long? Are backups subject to same retention?
- What incident reporting and data breach response requirements apply?

## Data minimization
Use pseudonymous `holder_ref` and derived flags for calculation; redact real names from analytics/logs; don't upload original KTP or bank data; refuse irrelevant PII; no model training/reuse by project.

## Required approvals before real data
Business owner + data protection/legal + IT security + provider contracts; documented use rights for uploaded documents; deletion and access control test evidence; privacy notices if necessary.

## Recommended privacy controls
Per-tenant encryption and RBAC; audit access and export; retention expiration jobs; secure deletion and receipts; restricted processors; encrypted transport, logs with field-level redaction; no public URL to original data.
