# Assumptions, Decisions & Unknowns

## Decision log
| ID | Decision | Why | Revisit |
|---|---|---|---|
| DEC-001 | Synthetic-first + BYOD | No Datindo/BEI/KSEI internal access | After pilot agreement |
| DEC-002 | Modular monolith | Solo-dev velocity, simpler security | At measurable scale bottleneck |
| DEC-003 | Deterministic engine | Auditable financial/regulatory logic | Never replace with raw LLM output |
| DEC-004 | Human verification before calculations | Unreliable OCR/LLM, classification ambiguity | Retain in production |
| DEC-005 | Two scenario types only in MVP | Keep formulas correct | After domain review |
| DEC-006 | Independent sellable product | Avoid Datindo single-customer risk | Preserve portability |
| DEC-007 | No scraping/public republication of IDX data | Terms and licensing | With explicit permission |
| DEC-008 | No legal 'compliant' badge in demo | Rules not expert-validated | Only after legal sign-off |

## Assumption register
- A-01: Corporate Secretary values scenario comparison. **Unvalidated**; interview required.
- A-02: Datindo has existing internal systems. **Partially supported by external developer portfolio, not Datindo confirmation**. No architecture promises.
- A-03: Datindo would distribute a premium module. **Hypothesis only**.
- A-04: Public data may support case studies, subject to licensing. **Needs per-source legal check**.
- A-05: Block-sale buyer remains eligible after transaction. **Scenario input invariant, must be verified**.

## Non-negotiables
No invented legal rules; no silently assumed eligible investors; no black-box regulatory score; no generated filing presented as official; no unaudited commercial claims; no implied Datindo partnership or logo use.

## Decision-making authority
Founder owns product scope; domain reviewer signs off interpretation; security reviewer signs off pilot data processing; buyer decides commercial value.
