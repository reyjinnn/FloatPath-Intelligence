# Technical Execution Plan — 6-week target (not guarantee)

## Week 0 / prerequisites
Confirm charter, do legal source acquisition/review, determine supported demo scope, approve synthetic fixtures, golden tests and exact arithmetic contracts.

## Week 1: Foundation
Repo scaffold, CI, env, schema, DB migrations, synthetic fixture loader, deterministic rule interfaces. **Exit:** reproducible data import and tests.

## Week 2: Pure engine
Classification, transfer/issuance, recomputation, invariants, rule version selection, audit result JSON. **Exit:** golden cases pass without web/API.

## Week 3: Backend + UX
API endpoints; company/snapshot/verification UI; scenario form and comparison; error states; integration tests. **Exit:** E2E manual synthetic flow.

## Week 4: AI + report
Optional PDF candidate extraction with human review; discrepancy detection, memo generator, export; eval harness. **Exit:** AI tests and manual fallback.

## Week 5: Hardening
QA regression, adversarial fixtures, audit, safe demo routing, deployment, performance smoke, accessibility; close severity critical/high. **Exit:** public demo Go criteria.

## Week 6: Commercial artifacts
60–90 sec demo, 1-page validation report, cold email, integration proposal, prospect feedback tracker. **Exit:** outbound-ready demo + measurable discovery plan.

## Scope protection
If behind schedule: cut AI extraction and use manual+CSV; do not cut deterministic arithmetic, evidence, legal warnings, or golden tests. Pilot-grade security never inferred from demo-grade setup.

## Definition of each sprint output
Code commits, updated docs, test run evidence, known issues, demo screenshots/videos, decisions, next milestone.
