# UX Flows / Screen Specification

## Guiding UX principles
Analyst-first, every number traceable, no false green compliance statuses, explicit snapshot date, non-expert-visible assumptions, clear irreversible/archived history.

## Screen 01 — Demo Home
Synthetic watermark + company selector + project limitations. CTA `Open Scenario`. Never impersonate Datindo or show its logo.

## Screen 02 — Company Overview
Top: company, board, snapshot date, version, verified flag. KPI: total shares, eligible shares, numeric ratio, known/unknown ownership, relevant SID (if verified). Warning if stale/incomplete. Side panel: source provenance.

## Screen 03 — Import & Review
Manual/CSV upload → column mapping → preview → row validation → reconciliation → `Approve Snapshot`. Reviewer sees changes and unknown flags. PDF extraction (if enabled) enters **candidate** state, never silently updates database.

## Screen 04 — Compliance Assessment
Shows current rule profile, effective date, coverage status, rule text refs, computed numeric status, missing data. `TARGET_MET_NUMERICALLY` deliberately distinct from legal compliance.

## Screen 05 — Simulator
Choose transfer or issuance; input holders/recipients, shares, price *optional*, eligibility/source. Preview eligibility changes for **every resulting holder**, recompute. Surface infeasible/unknown and dilution impact.

## Screen 06 — Scenario Comparison
Columns: baseline, A, B. Rows: total shares, eligible shares, free-float ratio, nonfree shares, shares to target (conditional), dilution, unresolved items, source date.

## Screen 07 — Memo
Executive summary, assumptions, metrics, differences, source/section references, legal caveats, reviewer status. Export `SIMULATION ONLY — NOT OFFICIAL FILING`.

## Accessibility & states
Keyboard controls; labels not color alone; screen reader tables; contrast target WCAG AA; loading/error/empty/permissions; demo reset. Do not use traffic-light compliant badge without legal review.

## Navigation and components
Header (Company, Snap date, demo flag), SnapshotStatus, RuleBadge, AssumptionDrawer, SourceLink, ScenarioForm, ComparisonTable, ExportControls.
