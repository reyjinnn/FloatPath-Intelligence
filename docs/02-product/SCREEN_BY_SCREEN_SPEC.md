# Screen-by-Screen Product Specification (MVP)

Each screen must clearly indicate `DEMO/SIMULATION_ONLY`, snapshot date, data source and last verification. No stock recommendation UI or trading action.

## 01 /demo — Public sandbox
- Read-only issuer list with synthetic banner; sample DEMO-001..005.
- Select company and scenario starter; CTA opens company overview.
- No real shareholder name, real dataset licensed content, or tenant enumeration.
- States: loading, no fixtures, server unavailable, maintenance.

## 02 /companies/{id} — Company overview
- Name, ID, board profile (if unknown label), total listed shares, snapshot date, eligibility coverage, SID count if documented.
- Warn if holdings do not reconcile to total; prohibit finalized assessment.
- Action: create new editable synthetic snapshot, import CSV, use sample.
- Accessibility: headings hierarchical, numeric formatting locale Indonesian, keyboard navigation.

## 03 /snapshots/{id}/verify — Data verification
- Column grid: holder identifier/pseudonym, shares, share class, controller, affiliate, treasury, restricted, eligibility tri-state, evidence.
- Upload CSV (P0); PDF candidate extraction (P1); never overwrite verified row silently.
- Buttons: save draft, validate, lock snapshot (only if balanced and approvals relevant).
- Show row-specific errors and source conflicts; review history visible.

## 04 /assessments/{id} — Numerical assessment
- Separate `current ratio`, `target ratio`, `rule profile`, and `knowledge limitations`.
- Criterion list with individually distinct results: numeric target, share count, SID, applicable transition, required missing facts.
- Do not show a green legal compliance badge on unapproved rules. Show status `SIMULATION_ONLY`.

## 05 /scenarios/new — Simulator
- Choose operation: transfer or issuance. Set number of shares and sender/recipient eligibility; buyer post-transaction holdings relevant.
- Preview delta T, delta F, ownership percentages, dilution, and input assumptions.
- Reclassify entire post-state ledger before presenting final numbers.
- Block negative balances, fractional shares, unknown receiver eligibility without caveat.

## 06 /scenarios/compare — Comparison
- Baseline + 2 selected alternatives in one table, same snapshot and rule version.
- Metrics: total shares, eligible shares, ratio, target gap, concentration flags, dilution, unverified issues.
- Warnings are always visible in print/export. No ranking of investment actions.

## 07 /reports/{id} — Memo preview
- Structured summary: date, snapshot, immutable scenario inputs/results hash, assumptions, evidence, missing validations, calculation method, legal disclaimer.
- Deterministic memo works without AI; optional AI drafting modifies prose only.
- Markdown/HTML export; file name includes DEMO and version ID.

## UX acceptance
- Every erroneous form field has a visible message and focus target.
- Units must be consistent; ratios never round up to mark pass.
- UI supports keyboard, standard contrast, screen-reader labels, readable mobile view.
- Untrusted or stale data is distinguished from verified snapshots by text, not color alone.
