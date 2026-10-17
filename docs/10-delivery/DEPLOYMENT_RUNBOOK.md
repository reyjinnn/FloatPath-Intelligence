# Deployment / Operations Runbook

## Environments
`local` synthetic dev; `staging` isolated synthetic full flow; `demo` public read-only synthetic and rate limited; `pilot` customer-authorized private environment **only after Gate G5**.

## Before deployment
1. Verify source commit, signed tests, dependency vulnerabilities, rule and fixture hashes.
2. Verify secrets in manager, CORS allowlist, TLS certificate, rate limits, logging redaction, demo fixture marker.
3. Verify database migration on staging and tested backup restore procedure.
4. Run integration + smoke E2E; AI external call policy disabled on demo where not necessary.
5. Confirm demo URL and report downloads have non-official watermark.

## Deployment sequence
Backup if relevant → run compatible migrations → deploy API → health/ready check → deploy web → smoke regression → monitor 30m (when staffed, not automated promise) → record release evidence.

## Rollback
Rollback stateless service to compatible version; don't blindly roll back destructive DB migrations. Use additive migration/expand-contract approach. Restore from backup only with incident approval and documented RPO/RTO.

## Operations
Daily synthetic demo availability check (optional scheduled by operator), monitor exceptions and spend budget, keep service/procurement contacts, rotate secrets. For confidential pilot define SLA, patch cadence, incident notification, retention and deletion playbook in contract.

## Escalations
Misleading compliance output = disable assessments/reports; possible data leak = revoke links/tokens, isolate tenant, investigate logs; AI parse issue = disable extraction and allow manual input.
