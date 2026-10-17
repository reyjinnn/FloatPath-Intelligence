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

## ADR template
`ID / Date / Owner / Status / Context / Alternatives / Decision / Trade-offs / Security & regulatory impact / Follow-up`.
