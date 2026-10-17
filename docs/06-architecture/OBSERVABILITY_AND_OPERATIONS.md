# Operational Readiness, Observability and Recovery

## Diagnostic signals
- Requests: rate, p50/p95 duration, 4xx/5xx rate, correlation IDs, per endpoint group.
- Engine: fixture regression count, unsupported-rule frequency, unknown-eligibility frequency, scenario reject reasons, rule version.
- AI: extract success, malformed schema, page citation verification, retry/fallback rate, token and estimated cost.
- Data: import failure by code, reconciliation failure, document quarantine status.
- Security: authentication failures, authorization denials, upload rejections, unusual export volumes.

## Sensitive-data handling
Do not log raw PDF text, shareholder names/IDs, API keys, auth tokens, memo content. Use sampled anonymous operational metadata. Retention configurable and reviewed before private pilot.

## Proposed pilot SLOs (not contractual)
- Availability ≥99% in defined pilot window excluding scheduled maintenance.
- Deterministic non-AI scenario p95 <2s for up to 10,000 holders on measured hardware, subject to benchmark.
- Critical security incidents: immediate disable external access; documented incident response.
- Restore test performed before accepting production-like real data.

## Incident runbook
1. Detect via alert; create incident ID, scope, severity, owner.
2. Stop uploads/public demo if potential data leak or broken rule results.
3. Preserve redacted logs, deployed commit, rule versions and snapshot hash.
4. If financial calculation defect, invalidate affected generated reports and communicate corrections according to agreement.
5. Restore from versioned release/backup, verify isolation and golden tests before reopening.
6. Produce root cause and prevention action; review retention/privacy reporting obligations with counsel where relevant.

## Backup strategy
Daily pilot backups to encrypted location; restrict access and test a restore to isolated environment. Define customer retention/deletion schedule by agreement; do not assert a universal statutory retention period here.
