# Week Zero Work Package — Before Application Coding

## W0.1 Documents and scope (owner: product)
- [ ] Freeze MVP P0 features and explicit non-goals.
- [ ] Choose supported synthetic board/rule profile; label all other profiles unsupported.
- [ ] Define demo customer journeys and acceptance tests.
- [ ] Identify real domain reviewer; if not possible, record blocker against regulatory claims.

## W0.2 Research & legal readiness (owner: domain)
- [ ] Acquire and version official regulation I-A amendment and implementing circular PDFs.
- [ ] Extract actual clause/page with rules, effective dates, transition and exceptions.
- [ ] Record reviewer and approval for every implemented rule; unresolved stay DRAFT.
- [ ] Verify site terms and data licenses before any use of real issuer data.

## W0.3 Dataset and golden cases (owner: engine)
- [ ] Create deterministic DEMO-001..005 fixtures matching data dictionary.
- [ ] Implement 20+ golden cases independently checked for arithmetic accuracy.
- [ ] Cover post-state eligibility reclassification and unknown affiliation.
- [ ] Hash/version all fixtures and expected results.

## W0.4 Technical bootstrapping (owner: dev)
- [ ] Decide Node LTS and Python version based on current supported releases.
- [ ] Create Git repo with CI, baseline code quality gates and precommit/secret scan.
- [ ] Define canonical API schemas, DTOs, DB naming standards, migrations.
- [ ] Ensure no production data, API keys, or customer secrets in repo.

## W0.5 User validation preparation (owner: founder)
- [ ] Prepare 90s script and 1-page product explanation.
- [ ] Identify at least two distinct customer segments (BAE + issuer Corsec).
- [ ] Set up evidence ledger for contact attempts, interviews, and pilot requests.

## G0 signoff record
`date | scope version | source registry version | verified formulas | fixture hash | golden case reviewer | data-rights gate | unresolved risks | approval or DEMO_ONLY`.

Without G0, only nonfinancial UI scaffolding and arithmetic sandbox are eligible for development. Do not conflate technical readiness with legal approval.
