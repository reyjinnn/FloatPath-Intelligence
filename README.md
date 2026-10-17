# FloatPath Intelligence — Development Documentation Pack v2

> **Status:** expanded pre-development specification v2.0 — 17 Oktober 2026  
> **Bahasa:** Indonesia (nama identifier teknis dalam English)  
> **Target:** prototype-first, synthetic-first, bring-your-own-data (BYOD), Datindo as potential customer/channel **not** a confirmed partner.

## Tujuan
FloatPath adalah **Explainable Free Float Compliance & Corporate Action Scenario Planning Platform** untuk Corporate Secretary, tim BAE, dan penasihat emiten. Software mengubah **input/snapshot kepemilikan → validasi bukti → evaluasi aturan → simulasi keputusan → report dengan provenance**. Ini sistem dukungan keputusan, **bukan** rekomendasi transaksi/pendapat hukum/sertifikasi kepatuhan.

## Keputusan yang sudah dikunci
- MVP tidak memerlukan API Datindo, BEI, KSEI, atau dokumen rahasia. Dataset default sepenuhnya sintetis.
- Frontend Next.js + TypeScript; backend Python/FastAPI; PostgreSQL; OpenAI API untuk ekstraksi dan draf penjelasan; rule engine deterministik.
- Tidak scraping data BEI; verifikasi lisensi data sebelum pemakaian komersial.
- Simulator awal: **distribusi block sale** dan **new-share issuance**, hanya pada penerima yang eligibility-nya diketahui; transaksi nyata tidak dieksekusi.
- Tidak mengganti layanan pelaporan/administrasi saham Datindo. Produk berdiri sendiri agar dapat dijual langsung ke emiten.

## Link semua file `.md` (termasuk screenshot)
- **[SCREENSHOT_FILE_MAP.md](SCREENSHOT_FILE_MAP.md)** — tautan langsung untuk setiap file dari screenshot.
- **[ALL_MARKDOWN_FILES.md](ALL_MARKDOWN_FILES.md)** — indeks lengkap seluruh dokumen `.md` dalam paket v2.
- **[CODING_AGENT_HANDOFF.md](docs/10-delivery/CODING_AGENT_HANDOFF.md)** — instruksi implementasi tahap demi tahap.
- **[WEEK_ZERO_WORKPACK.md](docs/10-delivery/WEEK_ZERO_WORKPACK.md)** — checklist kerja sebelum coding domain engine.

## Cara membaca (urutan wajib)
1. [START_HERE](START_HERE.md): checkpoint dan urutan pengerjaan.
2. [Project charter](docs/00-governance/PROJECT_CHARTER.md), [assumptions & decisions](docs/00-governance/ASSUMPTIONS_AND_DECISIONS.md).
3. [BRD](docs/01-business/BRD.md) → [PRD](docs/02-product/PRD.md) → [MVP scope](docs/02-product/MVP_SCOPE.md) → [UX](docs/02-product/UX_FLOWS.md).
4. [Regulatory specification](docs/03-regulatory/REGULATORY_SPEC.md) + [source register](docs/03-regulatory/SOURCE_REGISTER.md) **sebelum** implementasi aturan.
5. [Data dictionary](docs/04-data/DATA_DICTIONARY.md), [synthetic data plan](docs/04-data/SYNTHETIC_DATASET.md), [simulation specification](docs/05-engine/SIMULATION_SPEC.md).
6. [Architecture](docs/06-architecture/ARCHITECTURE.md), [DB design](docs/06-architecture/DATABASE_DESIGN.md), [API contract](docs/06-architecture/API_CONTRACT.md).
7. [AI](docs/07-ai/AI_SPEC.md) + [eval](docs/07-ai/AI_EVALUATION.md) + [security](docs/08-security/THREAT_MODEL.md).
8. [Test plan](docs/09-quality/TEST_PLAN.md) + [golden cases](docs/09-quality/GOLDEN_TEST_CASES.md), [development plan](docs/10-delivery/EXECUTION_PLAN.md), [pilot strategy](docs/11-commercial/COMMERCIAL_VALIDATION.md).

## Coding agent handoff
Start with [AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md). Also consult [requirement traceability](docs/09-quality/TRACEABILITY_MATRIX.md), [invariants and edge cases](docs/05-engine/INVARIANTS_AND_EDGE_CASES.md), [API status codes](docs/06-architecture/ERROR_AND_STATUS_CODES.md), and [privacy impact assessment](docs/08-security/PRIVACY_IMPACT_ASSESSMENT.md).

## Documentation index
| Area | Files |
|---|---|
| Governance | `PROJECT_CHARTER.md`, `ASSUMPTIONS_AND_DECISIONS.md`, `DEFINITION_OF_DONE.md`, `ADR.md` |
| Business | `BRD.md`, `VALUE_PROPOSITION.md` |
| Product | `PRD.md`, `MVP_SCOPE.md`, `UX_FLOWS.md`, `USER_STORIES.md` |
| Regulatory | `REGULATORY_SPEC.md`, `SOURCE_REGISTER.md`, `LEGAL_REVIEW_CHECKLIST.md` |
| Data | `DATA_DICTIONARY.md`, `SYNTHETIC_DATASET.md`, `DATA_GOVERNANCE.md` |
| Engine | `SIMULATION_SPEC.md`, `RULE_ENGINE_DESIGN.md` |
| Architecture | `ARCHITECTURE.md`, `DATABASE_DESIGN.md`, `API_CONTRACT.md`, `LOCAL_SETUP.md` |
| AI | `AI_SPEC.md`, `AI_EVALUATION.md` |
| Security | `THREAT_MODEL.md`, `SECURITY_REQUIREMENTS.md` |
| Quality | `TEST_PLAN.md`, `GOLDEN_TEST_CASES.md`, `RELEASE_GATE.md` |
| Delivery | `EXECUTION_PLAN.md`, `SPRINT_BACKLOG.md`, `DEPLOYMENT_RUNBOOK.md` |
| Commercial | `COMMERCIAL_VALIDATION.md`, `DEMO_SCRIPT.md` |
| Reference | `GLOSSARY.md`, `OPEN_QUESTIONS.md` |
| Templates | `BUG_REPORT_TEMPLATE.md`, `RULE_CHANGE_TEMPLATE.md`, `DECISION_MEMO_TEMPLATE.md` |

## Critical legal and product warning
Pernyataan OJK per 2 April 2026 menegaskan revisi aturan free float minimum 15% berlaku sejak 31 Maret 2026. Namun, **teks legal primer lengkap dan tafsir pasal-per-pasal belum di-review ahli untuk paket ini**. Angka/aturan transisi, eligibility, 5% threshold, minimum SID/saham, pengecualian papan, dan corporate action approval wajib masuk *legal review gate* sebelum sistem mengeluarkan klaim compliance produksi. Semasa MVP, status hasil: `SIMULATION_ONLY`/`REQUIRES_VERIFICATION`.

## External references
- OJK/BEI/KSEI joint release: https://ojk.go.id/id/berita-dan-kegiatan/siaran-pers/Pages/OJK-BEI-dan-KSEI-Tuntaskan-Empat-Agenda-Reformasi-Transparansi-Pasar-Modal-Indonesia.aspx
- BEI terms: https://idx.co.id/id/syarat-penggunaan/
- Datindo services: https://www.datindo.com/
- BEI regulations index: https://www.idx.co.id/id/peraturan/
- UU PDP 27/2022: https://peraturan.bpk.go.id/Details/229798/uu-no-27-tahun-2022

**Seluruh contoh saham, perusahaan, angka, akun, harga, dan hasil yang bertanda DEMO adalah sintetis.**
