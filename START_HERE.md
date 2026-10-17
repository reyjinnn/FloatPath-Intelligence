# START HERE — execution order

## Prinsip
Jangan mulai dari UI. Urutan: **regulatory source → data model → deterministic golden tests → engine → API → UX → AI → security → demo → outreach**. Yang paling mahal dibetulkan belakangan adalah aturan salah.

## Week-zero checklist
- [ ] Baca `README.md` + BRD/PRD.
- [ ] Tetapkan cakupan perusahaan (papan dan tipe pencatatan yang ditangani); MVP default `DEMO_STANDARD`.
- [ ] Inventarisasi dokumen primer aturan & review ahli domain, catat nomor pasal dan versi.
- [ ] Finalkan klasifikasi `ELIGIBLE`, `INELIGIBLE`, `UNKNOWN` dan bukti yang membenarkan masing-masing.
- [ ] Tulis 20+ golden test cases, reviewer kedua menghitung independen.
- [ ] Finalkan ERD dan OpenAPI contract.
- [ ] Setujui synthetic-only public demo, tanpa data pribadi nyata.
- [ ] Buat private repo, CI, secret scanning, issue tracker.

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
