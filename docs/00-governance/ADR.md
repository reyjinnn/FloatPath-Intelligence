# Architecture Decision Records (summary)

## ADR-001: Modular monolith over microservices
**Status:** Accepted for prototype. **Context:** solo developer, no integration customers, low initial traffic. **Decision:** one FastAPI deployable with bounded domain modules. **Consequences:** fewer operational failure modes, easy extract later.

## ADR-002: Integer shares + Decimal monetary/rates
**Status:** Accepted. Rounding is explicit; integer share transactions only; do not use JS float for official calculation (frontend preview may render backend result).

## ADR-003: Snapshot/version immutability
**Status:** Accepted. Data updates create new ownership snapshot; no overwrite of published assessments; hash inputs and rule version for reproducibility.

## ADR-004: AI outside trusted computation boundary
**Status:** Accepted. Extractors produce candidate values; user approves; deterministic engine owns results; AI memo consumes locked engine output only.

## ADR-005: Uploads off by default in public demo
**Status:** Accepted. If enabled, sandboxed synthetic documents only, file limits and private object storage; production user uploads require security/privacy gate.

## ADR-006: Self-hosted capability rather than mandatory Datindo platform
**Status:** Accepted. Data interface via manual input, CSV, optional REST; integrations deferred pending authorization.

## ADR-007: Authenticated product workspace with synthetic seed data
**Date:** 2026-10-17. **Status:** Accepted from product-owner direction. **Context:** client presentations must exercise the real workflow, not a public read-only demo. **Decision:** authenticated single-workspace application, persisted companies/snapshots/scenarios/reports, CSV/manual draft review, reviewer-only immutable locking, explicit synthetic seeding, and professional portfolio navigation. The public demo is disabled by default. Fictional presentation names do not change fixture identity or arithmetic expectations. **Security & regulatory impact:** no default credentials, no production-readiness claim, no real PII, no verified legal conclusion; restrained but visible synthetic labels and report warnings remain. OIDC/multi-tenant access, lawful real-data processing, independent legal review, penetration testing, and operational recovery remain release gates. **Follow-up:** actual tests and deployment evidence in `../10-delivery/IMPLEMENTATION_STATUS.md`.

## ADR-008: Enterprise Role-Based Access Control (RBAC) and Audit Trail
**Date:** 2026-10-17. **Status:** Accepted. **Context:** Enterprise and governance requirements necessitate clear separation of duties among four discrete roles: `viewer` (external auditor / read-only), `analyst` (draft editor, scenario builder, CSV importer), `reviewer` (authorized to validate and lock official immutable snapshots), and `admin` (workspace administration and user access management). **Decision:** Implement database-level role constraints (`CHECK role IN ('admin', 'reviewer', 'analyst', 'viewer')`), API-level authorization dependencies returning standard HTTP 403 problem details on unauthorized operations, and UI role adaptation in Next.js. Mutation operations (`holdings:review`, `holdings:import`, `:lock`, `/users`) emit structured audit log events (`audit_events` table) recording actor username, role, action, target entity, and client IP. Audit logs are accessible to auditors (`viewer`), `reviewer`, and `admin`, but restricted from `analyst`. **Security & regulatory impact:** Strict privilege minimization; immutable snapshots require reviewer/admin authority; audit trail guarantees accountability for all ledger modifications; all operations remain strictly within synthetic boundaries.

## ADR template
`ID / Date / Owner / Status / Context / Alternatives / Decision / Trade-offs / Security & regulatory impact / Follow-up`.
