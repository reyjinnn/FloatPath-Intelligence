# AGENTS.md — Instructions for Coding Agents

> Read this **before** generating or editing any code in FloatPath. This repository currently begins as a documentation specification, not a finished implementation.

## Mission
Deliver a transparent, deterministic free-float simulation and evidence-traceable decision support tool. Prototype uses **synthetic data only**, with no Datindo/BEI/KSEI private integration, no market scraping, no financial recommendations, and no assertion of legal compliance.

## Authority order
1. `docs/03-regulatory/REGULATORY_SPEC.md` and verified legal sources (unverified clauses stay disabled).
2. `docs/05-engine/SIMULATION_SPEC.md` and `docs/09-quality/GOLDEN_TEST_CASES.md`.
3. `docs/02-product/PRD.md` and `docs/06-architecture/API_CONTRACT.md`.
4. Decisions in `docs/00-governance/ADR.md`.
5. UI and sample demo scripts.

## Agent operating contract
- Do not silently invent unknown legal rules, company facts, ownership eligibility, Datindo integration details, or approved source licenses.
- Clearly label assumptions and ask for a domain decision only when genuinely blocking; otherwise implement safe fallback (`SIMULATION_ONLY`, `REQUIRES_VERIFICATION`, `UNSUPPORTED_RULE`).
- Write tests **before** or alongside engine implementation; do not edit expected golden outputs to match buggy code.
- Keep financial shares as integers and prices/ratios as Decimal; no binary floating-point rounding for rule decisions.
- Keep model output candidate-only until accepted by reviewer; do not let OpenAI author authoritative numeric or legal verdict.
- Never build scrapers for BEI/KSEI without a lawful, explicit license and scope.
- Use sanitized/synthetic fixtures in tests and logs, no real shareholder PII or API keys.
- Do not build purchase/placement execution or automatic submissions to regulators.
- Server re-evaluates entire holder ledger after every transaction, including recipient crossing any verified eligibility threshold.
- One clean migration per schema change; use integration tests for read/write boundaries.
- Prefer boring, testable modules over excessive agents/microservices.

## Expected implementation structure
- `apps/web` Next.js/TypeScript with user-visible warnings and provenance.
- `apps/api` FastAPI/Pydantic, typed endpoint contracts, auth boundaries.
- `packages/engine` pure Python functions, no network or LLM dependence.
- `datasets/synthetic` generated, reproducible test fixtures.
- `tests` golden tests, property tests, integration, E2E/security.

## Per-task delivery checklist
1. Note requirements IDs and changed files.
2. Implement smallest coherent change with validation and error states.
3. Run relevant automated tests and record commands/results accurately.
4. Update docs/contracts if behavior changed.
5. Explain limitations/unverified assumptions.

## Forbidden shortcuts
No mock results masquerading as actual engine output; no `/admin` demo backdoors; no hardcoded secret; no live PII; no generative AI producing 'compliant' badges; no inferred Datindo partner identity; no unlicensed market data ingestion.
