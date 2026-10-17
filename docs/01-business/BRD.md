# Business Requirements Document (BRD)

## Executive summary
FloatPath is an auditable planning tool for Indonesian listed-company free-float scenarios. It augments issuer/BAE analysis, not a BAE registry replacement. Datindo is a prospective distribution/integration partner; no contract or access exists.

## Opportunity context and evidence
- OJK/BEI/KSEI release dated 2 April 2026 confirms free-float rule changed to 15%, more granular ownership information, and >1% disclosure (see source register).
- Datindo advertises share administration, ownership analysis, corporate actions, and investor-relations services. Overlap is real, gaps uncertain.
- Sinartama Gunita Qaptive has paid analytics tier; illustrates market precedent, **not evidence of demand for FloatPath's specific simulator**.

## Stakeholders
**Economic buyer**: issuer CFO/CorpSec head, or BAE commercial owner (hypothesis). **Users**: CorpSec analyst, BAE analyst, finance/legal reviewer. **Gatekeepers**: IT security, procurement, compliance.

## Job-to-be-done
Given an *approved dated shareholder snapshot*, evaluate the applicable requirement, compare proposed share distribution/issuance changes, flag unresolved eligibility, and prepare an evidence-linked decision briefing.

## Desired outcomes and KPIs
| Business outcome | Proposed KPI | How measured |
|---|---|---|
| Reduce prep/rework | Time per analyzed scenario | Baseline manual vs tool on matched cases |
| Increase consistency | Correct calculations | 100% against signed golden cases |
| Improve explainability | Provenance coverage | % result lines linked to input/rule source |
| Reduce ambiguity | Unknown eligibility detection | Precision/recall on labeled cases |
| Monetization viability | Buyer acceptance | Qualified meetings, 1 scoped paid pilot, actual budget validation |

Targets beyond arithmetic correctness are **pilot hypotheses**, not promises. No advertised ROI until measured.

## Business requirements
- BR-01 Analyze verified issuer snapshot without vendor lock-in.
- BR-02 Prevent false compliance certainty when shareholder data/eligibility incomplete.
- BR-03 Support transparent side-by-side scenarios with invariant checks.
- BR-04 Explain all outputs and data sources to a human reviewer.
- BR-05 Generate neutral, non-filing discussion memo.
- BR-06 Minimize integration cost via CSV/manual/API boundary.
- BR-07 Protect client documents and tenant boundaries in pilot.

## Constraints
No privileged Datindo access; public data reuse permissions; changing rules; no automatic corporate action execution; domain review needed before production claim.

## In/out-of-scope
See [MVP Scope](../02-product/MVP_SCOPE.md). Risks, commercial validation, and dependencies: [Commercial validation](../11-commercial/COMMERCIAL_VALIDATION.md).

## Business sign-off
Status `PROPOSED`. Need real user's workflow sample, approval by legal/domain reviewer, at least one buyer conversation, pilot metrics baseline.
