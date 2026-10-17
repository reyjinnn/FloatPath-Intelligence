# Risk Register & Assumption Ownership

Status: pre-development / owner belum ditetapkan. Severity memakai *Likelihood (L) × Impact (I)* 1–5; skor bukan probabilitas nyata.

| ID | Risiko | L | I | Mitigasi / trigger | Penanggung jawab usulan |
|---|---|---:|---:|---|---|
| R-01 | Interpretasi regulasi salah | 4 | 5 | Legal gate, review pasal-ke-rule, jangan gunakan `COMPLIANT` | Domain reviewer + tech lead |
| R-02 | Data ownership/afiliasi tidak lengkap | 5 | 5 | Eligibility 3-state, bounded/unknown output, manual verification | Data owner |
| R-03 | Hak data BEI/KSEI dilanggar | 4 | 5 | Synthetic-first, license registry, non-scraping policy | Product/legal |
| R-04 | Kalkulasi salah setelah reclassification | 4 | 5 | Full ledger recompute + golden/property tests | Engine owner |
| R-05 | AI mengarang source/page/angka | 4 | 4 | Typed candidate, citation verifier, mandatory accept step | AI owner |
| R-06 | Dokumen lintas tenant bocor | 3 | 5 | RLS/service authorizer, tenant-isolation tests, private bucket | Security owner |
| R-07 | Produk tumpang tindih Datindo | 4 | 4 | Fit-gap, differentiator modular, issuer-direct fallback | Business owner |
| R-08 | Tidak ada pembeli | 4 | 5 | Discovery, pilot intent, no 200–450m pricing promises | Founder |
| R-09 | Scope creep rights issue/approval | 5 | 3 | Scope lock & change request; MVP limited operations | Product owner |
| R-10 | Sumber regulasi berubah | 4 | 4 | Versioned rules, change impact, freeze issued reports | Compliance owner |
| R-11 | Input malicious PDF/CSV | 4 | 4 | File limits, AV/quarantine, schema guard, injection eval | Security owner |
| R-12 | Cold email gagal dibalas | 4 | 3 | Parallel target issuers; measure qualified responses | Business owner |

## Risk review cadence
- Week zero: log each R with actual owner, mitigation evidence, due date, status.
- Every sprint: review score change and newly discovered risks; archive decisions in ADR.
- Trigger **block release** if R-01/R-03/R-04/R-06 unresolved at critical severity.
- Trade-off example: if legal review unavailable, release only explicitly arithmetic-demo functionality; disable verified regulatory verdict.

## Assumptions register minimum fields
`id, statement, evidence_url, verified(boolean), owner, review_due, consequence_if_false, decision_id`.
Do not convert a hypothesis into established fact because it appears in multiple research summaries.
