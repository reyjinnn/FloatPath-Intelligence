# Risk Register & Assumption Ownership

Status: pre-development / owner not yet assigned. Severity uses *Likelihood (L) × Impact (I)* on a 1–5 scale; scores are not actual probabilities.

| ID | Risk | L | I | Mitigation / trigger | Proposed owner |
|---|---|---:|---:|---|---|
| R-01 | Incorrect regulatory interpretation | 4 | 5 | Legal gate, clause-to-rule review, do not use `COMPLIANT` | Domain reviewer + tech lead |
| R-02 | Incomplete ownership/affiliation data | 5 | 5 | Eligibility 3-state, bounded/unknown output, manual verification | Data owner |
| R-03 | BEI/KSEI data rights violated | 4 | 5 | Synthetic-first, license registry, non-scraping policy | Product/legal |
| R-04 | Incorrect calculation after reclassification | 4 | 5 | Full ledger recompute + golden/property tests | Engine owner |
| R-05 | AI fabricates sources/pages/numbers | 4 | 4 | Typed candidate, citation verifier, mandatory accept step | AI owner |
| R-06 | Cross-tenant document leak | 3 | 5 | RLS/service authorizer, tenant-isolation tests, private bucket | Security owner |
| R-07 | Product overlaps with Datindo | 4 | 4 | Fit-gap, modular differentiator, issuer-direct fallback | Business owner |
| R-08 | No buyers | 4 | 5 | Discovery, pilot intent, no 200–450m pricing promises | Founder |
| R-09 | Scope creep rights issue/approval | 5 | 3 | Scope lock & change request; MVP limited operations | Product owner |
| R-10 | Regulatory sources change | 4 | 4 | Versioned rules, change impact, freeze issued reports | Compliance owner |
| R-11 | Malicious PDF/CSV input | 4 | 4 | File limits, AV/quarantine, schema guard, injection eval | Security owner |
| R-12 | Cold emails receive no replies | 4 | 3 | Parallel target issuers; measure qualified responses | Business owner |

## Risk review cadence
- Week zero: log each R with actual owner, mitigation evidence, due date, status.
- Every sprint: review score change and newly discovered risks; archive decisions in ADR.
- Trigger **block release** if R-01/R-03/R-04/R-06 unresolved at critical severity.
- Trade-off example: if legal review unavailable, release only explicitly arithmetic-demo functionality; disable verified regulatory verdict.

## Assumptions register minimum fields
`id, statement, evidence_url, verified(boolean), owner, review_due, consequence_if_false, decision_id`.
Do not convert a hypothesis into established fact because it appears in multiple research summaries.
