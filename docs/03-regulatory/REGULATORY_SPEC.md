# Regulatory Specification — NOT YET LEGALLY APPROVED

## State of verified facts
OJK joint statement dated 2 April 2026 confirms BEI amended Regulation I-A effective 31 March 2026, raising a minimum free-float requirement to 15% with revised classification. It does **not**, by itself, fully specify all issuer/board nuances, transitional exemptions, exceptions, SID tests, or transaction approvals. [Source register](SOURCE_REGISTER.md).

## Rule inventory — implementation placeholders
| Rule ID | Candidate requirement | Source state | Behavior until approved |
|---|---|---|---|
| FF-BASE-001 | Free float fraction = eligible / listed shares | Arithmetic definition | Implement as `SIMULATION_ONLY` |
| FF-MIN-PCT | Minimum 15% for applicable continuous listing group | OJK summary confirms headline | `TARGET_MET_NUMERICALLY`; no legal certificate |
| FF-MIN-SHARES | Candidate 50m eligible shares | Needs direct regulation clause review | Rule disabled for definitive results |
| FF-SID-COUNT | Candidate minimum 300 valid SID | Needs direct clause review | Rule disabled unless verified |
| FF-ELIGIBILITY | Controller/affiliate/directors/treasury/lock-up/ownership ≥5% exclusions *as candidate* | Needs full legal verification | `UNKNOWN` unless manually verified |
| FF-BOARD | Board-specific rule differences (e.g. Acceleration) | Needs specific regulations | `UNSUPPORTED_RULE` for nonapproved profiles |
| FF-TRANSITION | 2027/2028/2029 staged timetable *candidate* | Secondary reading; primary clause review pending | UI narrative only, no hard compliance decisions |
| FF-EXCEPTIONS | Issuer-specific approvals or exempt holders | Unknown until documents provided | Manual flagged override requiring review |

## Temporal rule model
`rule_id`, `version`, `source_id`, `source_section`, `board_scope`, `issuer_scope`, `effective_from`, `effective_to`, `threshold`, `conditions`, `exception_schema`, `reviewer_signoff`, `status (DRAFT|VERIFIED|RETIRED)`, `content_hash`.

## Rule selection algorithm
1. Identify board, listing category, relevant assessment date, baseline effective date, & company-specific exceptions.
2. Resolve single `VERIFIED` applicable rule set; if zero or ambiguous → `UNSUPPORTED_RULE`.
3. Check data complete: totals, eligibility, required SID/holders if applicable, capitalization date as needed.
4. Run deterministic calculations; return each criterion status separately.
5. Display `TARGET_MET_NUMERICALLY` only for numeric target; `LEGAL_CONCLUSION_UNAVAILABLE` until domain-approved full profile and verified evidence.

## Critical traps
- A transfer to a recipient that reaches an exclusion ownership threshold may **not** add to eligible free float.
- A sale between two eligible holders leaves eligible total unchanged.
- A rights issue alone does not imply all new shares eligible; recipient allocations matter.
- Current free-float ratio is not necessarily equal to a simple public/retail category.
- An issuer with 15% ratio can fail other requirements or be under a different rule profile.

## Required legal review questions
Full listing chapter and paragraph; board and IPO vs continual listing; 5% treatment and exceptions; block sale/rights issue consequences; number of shares/SID measurement; treatment of nominees/custodians/beneficial ownership; rounding and effective date; rights/shareholder approval; latest amendments; required data licenses.

## Product and regulatory firewall
Output fields: `arithmetic_result`, `assumed_eligibility`, `rule_profile`, `verified_source_refs`, `unresolved_facts`, `assessment_status`. Never expose unreviewed rule check as `COMPLIANT`.
