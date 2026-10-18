# START HERE — execution order

## Principle
Do not start with the UI. Order: **regulatory source → data model → deterministic golden tests → engine → API → UX → AI → security → demo → outreach**. Incorrect rules are the most expensive mistakes to fix later.

## Week-zero checklist
- [ ] Read `README.md` + BRD/PRD.
- [ ] Define company scope (supported boards and listing types); MVP default `DEMO_STANDARD`.
- [ ] Inventory primary regulatory documents & domain expert reviews; record clause numbers and versions.
- [ ] Finalize the `ELIGIBLE`, `INELIGIBLE`, `UNKNOWN` classifications and the evidence supporting each.
- [ ] Write 20+ golden test cases, with a second reviewer calculating independently.
- [ ] Finalize the ERD and OpenAPI contract.
- [ ] Approve a synthetic-only public demo, with no real personal data.
- [ ] Create a private repo, CI, secret scanning, and issue tracker.

## Build sequence
**Gate G0: Rules & data** — no production claims until verified.  
**Gate G1: Engine** — unit/invariant/property tests pass.  
**Gate G2: API+UX** — full synthetic flow without AI.  
**Gate G3: AI** — human-verified extraction, calibrated eval.  
**Gate G4: Demo** — sandbox, no secret data, error states.  
**Gate G5: Pilot** — only after lawful data access and security review.

## Definition of first demo
Synthetic company → verified ownership snapshot → `SIMULATION_ONLY` assessment → two scenario calculations → comparison → traceable memo export. No external integration needed.

## Stop/pivot gates
- Fundamental formula/legal source uncertain: stop compliance claim, proceed only with arithmetic sandbox.
- AI cannot cite source correctly: disable AI auto-fill, keep manual inputs.
- No qualified data entitlement: run demo only on synthetic fixtures.
- Datindo has equivalent product: pivot to standalone issuer users or embeddable engine, not duplicate existing reporting portal.
