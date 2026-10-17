# Project Charter

| Field | Value |
|---|---|
| Working title | FloatPath Intelligence |
| Release | Prototype v0.1; proposed MVP v1.0 |
| Owner | Independent developer/team (no Datindo affiliation) |
| Audience | Issuer Corporate Secretary; BAE analyst; legal/corporate finance reviewer |
| Strategic account | PT Datindo Entrycom (prospective only) |
| Initial operating mode | Synthetic-only public sandbox; isolated private BYOD pilot later |
| Geographic/regulatory scope | Indonesian listed issuers; scope restricted to verified rule profiles |

## Problem hypothesis
Corporate Secretary/BAE teams may spend time reconciling ownership snapshots, recalculating alternative capital transactions, and assembling supportable briefing memos. We have **not interviewed Datindo**; problem intensity, current workflows, and willingness to pay are unverified.

## Outcome hypothesis
Produce auditable simulations with fewer arithmetic/reconciliation errors, less manual rework, and faster preparation of an analyst-reviewed decision memo. Measure in a pilot; do not claim those benefits preemptively.

## Product boundaries
- Decision-support only. No trade/placement execution, legal opinion, securities solicitation, automatic filing, custody, or investment advice.
- The system never labels a company legally compliant based only on LLM-extracted data or incomplete ownership classification.
- Users own/authorize their data; commercial redistribution of third-party market data requires permission.

## Milestones
M0 sources + legal review queue; M1 engine golden tests; M2 functional sandbox; M3 AI eval; M4 demo readiness; M5 discovery/pilot agreement.

## Key risks
Regulatory accuracy, data rights, unavailable beneficial-ownership info, Datindo feature overlap, buyer unknown, AI hallucinations, cybersecurity, time scope creep.

## Success measurement
Engine correctness 100% on approved deterministic fixtures; 0 critical tenant leaks; scenario provenance complete; AI extraction per-field metrics documented; sales outcome measured by qualified replies/demos rather than unsupported likelihood percentages.
