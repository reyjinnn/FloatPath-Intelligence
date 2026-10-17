# Business Case, ROI Model and Pricing Hypotheses

## Hypotheses, not customer facts
Possible value drivers: analyst time reduced, fewer reconciliation revisions, faster comparison of scenarios, clearer evidence for legal review, premium issuer service revenue. Datindo budgets, internal time costs, and current pricing remain unknown.

## Baseline measurement (pilot)
For each case: `case_id, complexity_tier, source_count, analyst_minutes, reviewer_minutes, correction_rounds, document_errors, accepted_result, rule_version`.
Record both current workflow and FloatPath workflow using comparable cases, same data quality, and reviewer protocol. Do not cherry-pick easy demo fixtures.

## Example ROI mathematics (illustrative only)
- `N` cases/month, `t_before` and `t_after` in hours per case.
- `monthly_time_saved = N × max(0, t_before - t_after)`.
- `gross_time_value = monthly_time_saved × fully_loaded_hourly_cost`.
- `net_operational_value = gross_time_value - hosting - AI - reviewer - support - onboarding_amortized`.
- `annual_net_value = sum(monthly_net_value) - implementation_fee`.
- Premium service revenue is an *alternative* revenue stream, not automatically additive without demand evidence.

## Example for stakeholder discussion
Assume 40 cases/month, 3h baseline, 1.5h after, and Rp250,000/hour. Savings = 60h and illustrative gross time-value = Rp15,000,000/month. **No claim that this represents Datindo.** Validate all four variables during pilot.

## Pricing options to investigate
| Model | Buyer | What to learn |
|---|---|---|
| Paid diagnostic/pilot | BAE or issuer | Will sponsor bounded evaluation |
| Annual license | BAE operations | Usage frequency, SLA, seats |
| Per-issuer service license | Issuer/BAE channel | Margin and data isolation |
| API engine license | BAE IT | Embeddability and support burden |
| On-prem deployment + support | Sensitive-data customer | Security review and maintenance costs |

## Procurement caveats
Discovery and pilot scopes precede price. Historical estimates of Rp200–450m implementation are unvalidated. Require legal and security terms for production data.
