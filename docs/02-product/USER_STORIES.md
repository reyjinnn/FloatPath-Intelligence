# User Stories & Acceptance Scenarios

| ID | As a... | I want... | So that... | Verification |
|---|---|---|---|---|
| US-01 | Analyst | create a dated snapshot | I can reproduce old work | Required fields and audit log |
| US-02 | Analyst | see why shares are excluded | I can explain ratio | Eligibility reason & source |
| US-03 | Analyst | upload CSV then correct mismatches | I avoid dirty data | Row-wise validation; block publish |
| US-04 | Analyst | simulate distribution to many eligible recipients | I see realistic effects | Reclassification on every holder |
| US-05 | Analyst | simulate new shares issuance | I quantify denominator and dilution | Golden test |
| US-06 | Reviewer | inspect all assumptions | I can approve or reject | Review status logged |
| US-07 | Reviewer | see missing legal facts | I avoid misleading compliance claims | `REQUIRES_VERIFICATION` |
| US-08 | Analyst | export a source-linked memo | I brief my manager | Source references and watermark |
| US-09 | Demo viewer | reset to synthetic baseline | I explore safely | State reset, read-only storage |
| US-10 | Admin (pilot) | restrict each client data | clients remain isolated | Cross-tenant 403 tests |

## Main happy-path BDD
Given synthetic DEMO-001 with reconciled holders and verified eligibility, when the analyst creates a transfer with eligible recipients, then totals remain constant, free float recomputes, a comparison is created, and a memo references the dated snapshot and rule version.

## Unhappy-path BDD
Given unknown recipient affiliation, when a user enters transfer shares, then the app returns `REQUIRES_VERIFICATION` and does not mark the target as legally attained.
