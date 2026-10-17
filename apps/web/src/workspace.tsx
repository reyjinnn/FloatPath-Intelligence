"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Assessment, Company, ScenarioAction, SimulationResult, ReportResult, Eligibility, HolderType, Flag } from "./types/api";
import { ApiError, comparisonActions, decimalText, generateReport, getCompanies, getCompany, integer, numericLabel, percent, preset, priceValid, readActions, saveResult, sharesInput, simulate, storageKey } from "./lib";

type Screen = "demo" | "company" | "verify" | "assessment" | "scenario" | "compare" | "report";
const screenNames: Record<Screen, string> = { demo: "Ruang demo", company: "Ringkasan perusahaan", verify: "Tinjau data kepemilikan", assessment: "Asesmen numerik", scenario: "Buat skenario", compare: "Bandingkan skenario", report: "Memo & bukti" };
const descriptions: Record<Screen, string> = {
  demo: "Eksplorasi free float dengan data sintetis. Mulai dari ledger, pahami asumsi, lalu uji skenario secara transparan.",
  company: "Satu snapshot, jejak bukti yang jelas. Angka berasal dari API dan mesin deterministik, bukan perkiraan browser.",
  verify: "Tinjau setiap pemegang dan asumsi sumber. Ledger demo terkunci; tidak ada perubahan data yang disimpan.",
  assessment: "Pisahkan pencapaian target aritmetika dari penilaian hukum. Profil demo belum menjadi aturan terverifikasi.",
  scenario: "Uji transfer atau penerbitan saham. Seluruh ledger dihitung ulang oleh server setelah setiap skenario.",
  compare: "Baseline dan dua alternatif pada snapshot yang sama. Tidak ada peringkat atau rekomendasi transaksi.",
  report: "Memo deterministik dengan input, hash, sumber, dan keterbatasan. Bukan dokumen resmi atau rekomendasi investasi.",
};

function ErrorBox({ error, retry }: { error: unknown; retry: () => void }) {
  return <div className="error-box" role="alert"><strong>Data belum dapat dimuat</strong><p>{error instanceof Error ? error.message : "Terjadi kesalahan yang tidak dikenal."}</p>{error instanceof ApiError && error.correlationId && <p className="mono">ID permintaan: {error.correlationId}</p>}<button className="button secondary" onClick={retry}>Coba lagi</button></div>;
}
function Loading({ children = "Mengambil data dari API…" }: { children?: ReactNode }) {
  return <div className="loading" role="status"><span className="loader" aria-hidden="true" />{children}</div>;
}
function Panel({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><h2>{title}</h2>{children}</section>;
}
function Badge({ children }: { children: ReactNode }) { return <span className="badge">{children}</span>; }
function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}
function AssessmentMetrics({ assessment }: { assessment: Assessment }) {
  return <div className="metrics"><Metric label="Total saham" value={integer(assessment.total_shares)} note="derived · hasil mesin, lembar" /><Metric label="Saham eligible" value={integer(assessment.eligible_shares)} note="derived · menurut asumsi sintetis" /><Metric label="Rasio free float" value={percent(assessment.free_float_ratio)} note="derived · bukan kesimpulan hukum" /><Metric label="Target profil demo" value={percent(assessment.target_ratio)} note="input · profil DRAFT" /></div>;
}
function Limits({ assessment }: { assessment?: Assessment }) {
  return <div className="notice"><strong>Asumsi, bukan sertifikasi</strong><p>Kelayakan pemegang dan bukti fixture adalah asumsi sintetis. SID, afiliasi, pengecualian, tanggal berlaku, dan penerapan aturan nyata memerlukan verifikasi terpisah.</p>{assessment && <><p><Badge>{assessment.assessment_status}</Badge> <Badge>{numericLabel(assessment.numeric_target_status)}</Badge></p>{assessment.warnings.length > 0 && <ul>{assessment.warnings.map((warning, i) => <li key={`${warning}-${i}`}>{warning}</li>)}</ul>}{assessment.unresolved_constraints.length > 0 && <><strong>Validasi belum selesai</strong><ul>{assessment.unresolved_constraints.map((item, i) => <li key={`${item}-${i}`}>{item}</li>)}</ul></>}</>}</div>;
}
function Provenance({ company }: { company: Company }) {
  return <div className="provenance"><span><b>Snapshot</b> {company.snapshot.as_of_date}</span><span><b>Sumber</b> fixture sintetis · bukan data pasar</span><span><b>Verifikasi terakhir</b> belum ada verifikasi hukum</span><span className="mono"><b>ID</b> {company.snapshot.id}</span></div>;
}
function Ledger({ company, snapshot = company.snapshot }: { company: Company; snapshot?: Company["snapshot"] }) {
  return <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabel ledger, gulir horizontal jika diperlukan"><table><caption>Ledger {company.code} · {snapshot.as_of_date} · input sintetis</caption><thead><tr><th scope="col">Pemegang / tipe</th><th scope="col" className="number">Saham (lembar)</th><th scope="col">Kelayakan</th><th scope="col">Penanda</th><th scope="col">Bukti sintetis</th></tr></thead><tbody>{snapshot.holders.map(holder => <tr key={holder.holder_ref}><th scope="row"><span className="mono">{holder.holder_ref}</span><small>{holder.holder_type} · kelas saham tidak disediakan</small></th><td className="number">{integer(holder.shares)}</td><td><Badge>{holder.eligibility}</Badge></td><td><div className="flags">{([['Pengendali', holder.controller], ['Afiliasi', holder.controller_affiliate], ['Direksi/komisaris', holder.director_commissioner], ['Treasury', holder.treasury], ['Terbatas', holder.restricted]] as const).map(([name, value]) => <span key={name}>{name}: {value === true || value === "TRUE" ? "ya" : value === false || value === "FALSE" ? "tidak" : "belum diketahui (tidak disediakan)"}</span>)}</div></td><td className="evidence">{holder.evidence_ref || "Bukti belum tersedia"}</td></tr>)}</tbody></table></div>;
}
const hrefs = (c: Company) => ({ company: `/companies/${encodeURIComponent(c.code)}`, verify: `/snapshots/${encodeURIComponent(c.snapshot.id)}/verify?company=${encodeURIComponent(c.code)}`, assessment: `/assessments/${encodeURIComponent(c.snapshot.id)}?company=${encodeURIComponent(c.code)}`, scenario: `/scenarios/new?company=${encodeURIComponent(c.code)}`, compare: `/scenarios/compare?company=${encodeURIComponent(c.code)}`, report: `/reports/new?company=${encodeURIComponent(c.code)}` });

export default function Workspace({ screen, resource, companyCode }: { screen: Screen; resource?: string; companyCode?: string }) {
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(null); setCompany(null); setCompanies(null);
    async function load() {
      if (screen === "demo") { setCompanies(await getCompanies(controller.signal)); return; }
      let code = companyCode || (screen === "company" ? resource : undefined);
      if (!code && resource && ["verify", "assessment"].includes(screen)) {
        const list = await getCompanies(controller.signal);
        code = list.find(c => c.snapshot.id === resource || c.id === resource || c.code === resource)?.code;
      }
      if (!code) throw new ApiError("Pilih perusahaan dari ruang demo terlebih dahulu. ID snapshot atau perusahaan tidak ditemukan.");
      const data = await getCompany(code, controller.signal);
      if (resource && ["verify", "assessment"].includes(screen) && ![data.snapshot.id, data.id, data.code].includes(resource)) throw new ApiError("Snapshot pada URL tidak sesuai perusahaan. Buka kembali dari ringkasan perusahaan.");
      setCompany(data);
    }
    load().catch(e => { if (!controller.signal.aborted) setError(e); });
    return () => controller.abort();
  }, [screen, resource, companyCode, attempt]);
  const links = company ? hrefs(company) : null;
  return <div className="app-shell"><a className="skip-link" href="#main">Lewati ke konten</a><aside className="sidebar"><Link href="/demo" className="brand" aria-label="FloatPath, ruang demo"><span className="brand-mark" aria-hidden="true">f<span>p</span></span><span>FloatPath<small>INTELLIGENCE</small></span></Link><p className="nav-label">WORKSPACE SINTETIS</p><nav aria-label="Navigasi utama"><Link href="/demo" aria-current={screen === "demo" ? "page" : undefined}><span aria-hidden="true">01</span> Ruang demo</Link>{(["company", "verify", "assessment", "scenario", "compare", "report"] as const).map((s, i) => links ? <Link key={s} href={links[s]} aria-current={screen === s ? "page" : undefined}><span aria-hidden="true">0{i + 2}</span>{screenNames[s]}</Link> : <span className="nav-disabled" key={s}><span aria-hidden="true">0{i + 2}</span>{screenNames[s]}</span>)}</nav><div className="sidebar-bottom"><span className="status-dot" aria-hidden="true" /><strong>Transparan secara desain</strong><p>Data sintetis. Mesin deterministik. Bukti dapat ditelusuri.</p><small>Tidak terhubung ke BEI, KSEI, atau sistem privat.</small></div></aside><div className="workspace"><header className="topbar"><div><span className="eyebrow">FREE-FLOAT WORKBENCH</span><p>{company?.code || "Public sandbox"} <span aria-hidden="true">/</span> {screen === "demo" ? "Ruang demo" : screenNames[screen]}</p></div><span className="demo-pill">DEMO · READ ONLY</span></header><div className="simulation-banner"><span className="banner-icon" aria-hidden="true">i</span><div><strong>SIMULATION_ONLY</strong><span> Seluruh data sintetis. Bukan penilaian kepatuhan hukum, saran investasi, atau dokumen resmi.</span></div></div><main id="main" tabIndex={-1}><div className="page-heading"><div><p className="eyebrow">{screen === "demo" ? "MULAI DARI BUKTI" : `${company?.code || "DEMO"} / ANALISIS SINTETIS`}</p><h1>{screen === "demo" ? "Keputusan yang bisa ditelusuri." : screenNames[screen]}</h1><p>{descriptions[screen]}</p></div>{company && <Badge>{company.board}</Badge>}</div>{error ? <ErrorBox error={error} retry={() => setAttempt(a => a + 1)} /> : screen === "demo" ? companies ? <Demo companies={companies} /> : <Loading /> : company ? <><Provenance company={company} />{screen === "company" && <Overview company={company} />}{screen === "verify" && <Verify company={company} />}{screen === "assessment" && <AssessmentView company={company} />}{screen === "scenario" && <ScenarioForm company={company} />}{screen === "compare" && <Compare company={company} />}{screen === "report" && <Report company={company} />}</> : <Loading />}<footer className="footer"><span>FloatPath / Synthetic research workspace</span><span>Tanpa data pasar langsung · Tanpa eksekusi transaksi</span></footer></main></div></div>;
}

function Demo({ companies }: { companies: Company[] }) {
  return <><div className="demo-intro"><div><Badge>DATA SINTETIS · PUBLIC SANDBOX</Badge><h2>Mulai dari satu perusahaan.</h2><p>Tinjau kepemilikan, uji alternatif, dan susun memo berbukti. Semua perhitungan dilakukan oleh API.</p></div><ol className="journey"><li><b>01</b> Tinjau ledger</li><li><b>02</b> Uji skenario</li><li><b>03</b> Telusuri bukti</li></ol></div><div className="section-heading"><h2>Pilih perusahaan demo</h2><span>{companies.length} fixture tersedia</span></div>{companies.length === 0 ? <Panel title="Belum ada fixture"><p>API tidak menyediakan perusahaan demo. Tidak ada data contoh lokal yang menggantikan hasil API.</p></Panel> : <div className="company-grid">{companies.map((c, index) => <article key={c.id} className="company-card"><div className="card-top"><span className="company-monogram" aria-hidden="true">D{String(index + 1).padStart(2, "0")}</span><Badge>SINTETIS</Badge></div><p className="eyebrow">{c.code}</p><h3>{c.legal_name}</h3><p className="muted">{c.board} · {c.snapshot.as_of_date}</p><dl className="card-stats"><div><dt>Total saham · input</dt><dd>{integer(c.snapshot.total_shares)}</dd></div><div><dt>SID · input fixture</dt><dd>{integer(c.snapshot.sid_count)}</dd></div></dl><Link className="button card-link" href={hrefs(c).company} aria-label={`Buka perusahaan ${c.code}`}>Buka perusahaan <span aria-hidden="true">↗</span></Link></article>)}</div>}<div className="two-columns bottom-space"><Panel title="Bukti dulu. Kesimpulan kemudian."><p>Kelayakan dalam fixture bukan verifikasi pemegang saham nyata. Label target numerik tidak menyatakan kepatuhan hukum.</p></Panel><Panel title="Tidak perlu AI untuk menghitung"><p>AI tidak tersedia pada demo ini. Tinjauan ledger manual dan memo deterministik tetap dapat digunakan.</p></Panel></div></>;
}
function Overview({ company: c }: { company: Company }) {
  return <>{c.assessment ? <AssessmentMetrics assessment={c.assessment} /> : <div className="notice">Asesmen belum diberikan API. Tidak ada rasio yang dihitung di browser.</div>}<div className="two-columns"><Panel title="Snapshot kepemilikan"><dl className="detail-list"><div><dt>Nama sintetis</dt><dd>{c.legal_name}</dd></div><div><dt>ID perusahaan</dt><dd className="mono">{c.id}</dd></div><div><dt>Total saham · input</dt><dd>{integer(c.snapshot.total_shares)} lembar</dd></div><div><dt>Jumlah SID · input fixture</dt><dd>{integer(c.snapshot.sid_count)}<small>Bukan jumlah baris ledger; bukan validasi SID nyata.</small></dd></div><div><dt>Persetujuan reviewer hukum</dt><dd>Belum tersedia</dd></div></dl><div className="actions"><Link className="button" href={hrefs(c).verify}>Tinjau ledger</Link><Link className="button secondary" href={hrefs(c).assessment}>Lihat asesmen</Link></div></Panel><Panel title="Sumber & batas penggunaan"><p>Snapshot tetap, hanya-baca. Simulasi bersifat stateless dan tidak mengubah kepemilikan baseline.</p><p className="muted">Tidak ada unggahan CSV atau PDF publik, koneksi kustodian, harga pasar, maupun pengajuan regulator.</p>{c.assessment && <p className="hash"><b>Hash data · API</b><code>{c.assessment.data_hash}</code></p>}<Link href={hrefs(c).scenario} className="text-link">Buat skenario sintetis <span aria-hidden="true">↗</span></Link></Panel></div><Limits assessment={c.assessment} /></>;
}
function Verify({ company: c }: { company: Company }) {
  return <><div className="section-heading"><div><h2>Ledger & bukti sumber</h2><p className="muted">Fixture terkunci · seluruh penanda adalah asumsi sintetis</p></div><Badge>READ ONLY</Badge></div><Ledger company={c} /><div className="two-columns bottom-space"><Panel title="Tinjauan manual"><p>Periksa identitas pseudonim, saldo, kelayakan, dan referensi bukti pada tabel. Tidak ada tombol persetujuan atau penguncian palsu.</p><p>Riwayat perubahan reviewer: tidak tersedia untuk fixture tetap. Rekonsiliasi dan validasi numerik dilakukan oleh API saat asesmen.</p><Link className="button" href={hrefs(c).assessment}>Lanjut ke asesmen</Link></Panel><Panel title="Impor hanya melalui API privat"><p>Unggah CSV/PDF dinonaktifkan pada demo publik. Integrasi privat memerlukan autentikasi dan peran analyst/reviewer.</p><code className="endpoint">POST /api/v1/snapshots/&#123;id&#125;/holdings:import</code><p className="muted">Gunakan kontrak impor privat dan kredensial resmi di lingkungan terpisah. Jangan kirim data pribadi atau token melalui demo.</p><p>Ekstraksi AI tidak tersedia. Fallback: tinjau ledger manual yang ditampilkan.</p></Panel></div><Limits assessment={c.assessment} /></>;
}
function AssessmentView({ company: c }: { company: Company }) {
  const a = c.assessment;
  if (!a) return <Panel title="Asesmen belum tersedia"><p>Respons perusahaan tidak memiliki asesmen. Tidak ada perhitungan rasio lokal.</p><Link href={hrefs(c).company} className="button secondary">Kembali ke ringkasan</Link></Panel>;
  return <><AssessmentMetrics assessment={a} /><div className="two-columns"><Panel title="Profil aturan & reproduksibilitas"><dl className="detail-list"><div><dt>Profil</dt><dd className="mono">{a.rule_set_id}</dd></div><div><dt>Versi · API</dt><dd>{a.rule_version}</dd></div><div><dt>Status aturan</dt><dd><Badge>{a.rule_status}</Badge></dd></div><div><dt>Tanggal berlaku hukum</dt><dd>Belum diverifikasi; tidak diterapkan sebagai aturan hukum</dd></div><div><dt>Hash data</dt><dd className="mono hash">{a.data_hash}</dd></div></dl></Panel><Panel title="Hasil per kriteria"><dl className="detail-list"><div><dt>Target aritmetika</dt><dd>{numericLabel(a.numeric_target_status)}<small>{a.numeric_target_status}</small></dd></div><div><dt>Rekonsiliasi & saham</dt><dd>Hasil mesin pada snapshot di atas; lihat peringatan API</dd></div><div><dt>SID</dt><dd>{integer(c.snapshot.sid_count)} · hanya input sintetis</dd></div><div><dt>Transisi & pengecualian</dt><dd>Belum diverifikasi</dd></div><div><dt>Kesimpulan hukum</dt><dd>Tidak diberikan</dd></div></dl></Panel></div><Limits assessment={a} /><div className="actions"><Link className="button" href={hrefs(c).scenario}>Buat skenario</Link><Link className="button secondary" href={hrefs(c).verify}>Kembali ke bukti</Link></div><p className="muted small">Persentase diformat dari string desimal API; digit panjang dipotong, bukan dibulatkan untuk menentukan status. Status selalu berasal dari mesin.</p></>;
}

function ScenarioForm({ company: c }: { company: Company }) {
  const [type, setType] = useState<ScenarioAction["action_type"]>("TRANSFER");
  const [seller, setSeller] = useState("TRANSFER-SELLER");
  const [refs, setRefs] = useState(["DEMO-NEW-A", "DEMO-NEW-B"]);
  const [amounts, setAmounts] = useState(["25000000", "25000000"]);
  const [eligibilities, setEligibilities] = useState<Eligibility[]>(["ELIGIBLE", "ELIGIBLE"]);
  const [holderTypes, setHolderTypes] = useState<HolderType[]>(["ORGANIZATION", "ORGANIZATION"]);
  const [price, setPrice] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [stored, setStored] = useState(true);
  const form = useRef<HTMLFormElement>(null);
  const resultPanel = useRef<HTMLElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const holders = c.snapshot.holders.filter(h => !h.holder_type.toUpperCase().includes("AGGREGATE") && !h.holder_ref.includes("BUCKET"));
  function apply(action: ScenarioAction) {
    setType(action.action_type); setSeller(action.seller_ref || "TRANSFER-SELLER");
    setRefs(action.allocations.map(a => a.holder_ref)); setAmounts(action.allocations.map(a => String(a.shares)));
    setEligibilities(action.allocations.map(a => a.eligibility)); setHolderTypes(action.allocations.map(a => a.holder_type as HolderType)); setPrice(action.price_idr_per_share || "");
    setResult(null); setErrors({}); setError(null);
  }
  useEffect(() => { const saved = readActions(c); if (saved.length) apply(saved[saved.length - 1]); return () => activeRequest.current?.abort(); }, [c]);
  const replace = <T,>(values: T[], index: number, value: T) => values.map((v, i) => i === index ? value : v);
  function evidence(index: number) {
    return c.snapshot.holders.find(h => h.holder_ref === refs[index])?.evidence_ref ||
      c.snapshot.holders.find(h => h.evidence_ref)?.evidence_ref ||
      `fixture://${c.code.toLowerCase()}/eligible-bucket`;
  }
  async function submit(event?: FormEvent) {
    event?.preventDefault(); setError(null); setResult(null);
    const next: Record<string, string> = {};
    const shares = amounts.map(sharesInput);
    shares.forEach((value, i) => { if (value === null) next[`shares-${i}`] = "Masukkan bilangan bulat positif, hanya digit, maksimal 9.007.199.254.740.991 lembar."; });
    if (shares.every(v => v !== null) && shares.reduce<bigint>((sum, v) => sum + BigInt(v!), 0n) > BigInt(Number.MAX_SAFE_INTEGER)) next["shares-1"] = "Jumlah kedua alokasi melebihi batas integer aman. Kurangi alokasi.";
    if (refs[0] === refs[1]) next["recipient-1"] = "Pilih dua penerima yang berbeda, bukan bucket agregat.";
    if (type === "TRANSFER") refs.forEach((ref, i) => { if (ref === seller) next[`recipient-${i}`] = "Penerima tidak boleh sama dengan penjual."; });
    if (!priceValid(price)) next.price = "Gunakan harga positif dengan titik desimal dan maksimal 2 digit pecahan. Contoh: 250.00.";
    setErrors(next);
    if (Object.keys(next).length) { document.getElementById(Object.keys(next)[0])?.focus(); return; }
    const action: ScenarioAction = { action_type: type, ...(type === "TRANSFER" ? { seller_ref: seller } : {}), allocations: refs.map((ref, i) => ({ holder_ref: ref, shares: shares[i]!, eligibility: eligibilities[i], holder_type: holderTypes[i], evidence_ref: evidence(i) })), ...(price ? { price_idr_per_share: price } : {}) };
    activeRequest.current?.abort(); const controller = new AbortController(); activeRequest.current = controller;
    setBusy(true);
    try {
      const data = await simulate(c.code, action, controller.signal);
      setResult(data); setStored(saveResult(c, action, data));
      requestAnimationFrame(() => resultPanel.current?.focus());
    } catch (e) { if (!controller.signal.aborted) setError(e); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const fieldError = (id: string) => errors[id] ? <span id={`${id}-error`} className="field-error">{errors[id]}</span> : null;
  return <><div className="scenario-layout"><form ref={form} className="panel" noValidate onSubmit={submit} onChange={() => { setResult(null); setError(null); }}><h2>Input skenario <span className="input-tag">input</span></h2><fieldset disabled={busy}><legend className="sr-only">Parameter simulasi</legend><div className="field"><label htmlFor="operation">Jenis aksi</label><select id="operation" value={type} onChange={e => { setType(e.target.value as ScenarioAction["action_type"]); setErrors({}); }}><option value="TRANSFER">Transfer saham — total saham tetap</option><option value="NEW_ISSUANCE">Penerbitan baru — total saham bertambah</option></select></div><div className="preset-actions"><span>Isi contoh input:</span><button type="button" className="text-button" onClick={() => apply(preset("TRANSFER", c.code))}>Transfer 2 × 25 juta</button><button type="button" className="text-button" onClick={() => apply(preset("NEW_ISSUANCE", c.code))}>Terbit 2 × 29.411.765</button></div>{type === "TRANSFER" && <div className="field"><label htmlFor="seller">Penjual sintetis</label><select id="seller" value={seller} onChange={e => setSeller(e.target.value)}>{holders.map(h => <option key={h.holder_ref} value={h.holder_ref}>{h.holder_ref} · {integer(h.shares)} lembar</option>)}</select><small>Saldo dan batas transaksi divalidasi server, bukan dihitung sebagai hasil lokal.</small></div>}{[0, 1].map(i => <fieldset className="recipient" key={i}><legend>Penerima {i === 0 ? "A" : "B"} · alokasi individual</legend><div className="field"><label htmlFor={`recipient-${i}`}>Identitas penerima {i === 0 ? "A" : "B"}</label><select id={`recipient-${i}`} value={refs[i]} onChange={e => setRefs(replace(refs, i, e.target.value))} aria-invalid={!!errors[`recipient-${i}`]} aria-describedby={errors[`recipient-${i}`] ? `recipient-${i}-error` : undefined}>{["DEMO-NEW-A", "DEMO-NEW-B"].map(ref => <option key={ref} value={ref}>{ref} · pemegang baru</option>)}{holders.map(h => <option key={h.holder_ref} value={h.holder_ref}>{h.holder_ref} · pemegang existing</option>)}</select>{fieldError(`recipient-${i}`)}</div><div className="field"><label htmlFor={`shares-${i}`}>Jumlah saham penerima {i === 0 ? "A" : "B"} (lembar)</label><input id={`shares-${i}`} value={amounts[i]} inputMode="numeric" autoComplete="off" maxLength={32} onChange={e => setAmounts(replace(amounts, i, e.target.value))} aria-invalid={!!errors[`shares-${i}`]} aria-describedby={errors[`shares-${i}`] ? `shares-${i}-error` : `shares-${i}-help`} /><small id={`shares-${i}-help`}>Bilangan bulat positif tanpa titik pemisah atau pecahan.</small>{fieldError(`shares-${i}`)}</div><div className="form-pair"><div className="field"><label htmlFor={`eligibility-${i}`}>Asumsi kelayakan {i === 0 ? "A" : "B"}</label><select id={`eligibility-${i}`} value={eligibilities[i]} onChange={e => setEligibilities(replace(eligibilities, i, e.target.value as Eligibility))}><option value="ELIGIBLE">ELIGIBLE · asumsi sintetis</option><option value="INELIGIBLE">INELIGIBLE · asumsi sintetis</option><option value="UNKNOWN">UNKNOWN · perlu verifikasi</option></select></div><div className="field"><label htmlFor={`type-${i}`}>Tipe pemegang {i === 0 ? "A" : "B"}</label><select id={`type-${i}`} value={holderTypes[i]} onChange={e => setHolderTypes(replace(holderTypes, i, e.target.value as HolderType))}><option value="ORGANIZATION">Organisasi</option><option value="PERSON">Individu (PERSON) · sintetis</option></select></div></div><p className="evidence"><b>Bukti asumsi:</b> {evidence(i)}</p></fieldset>)}<div className="field"><label htmlFor="price">Harga IDR per saham (opsional)</label><input id="price" value={price} inputMode="decimal" placeholder="Contoh: 250.00" maxLength={32} onChange={e => setPrice(e.target.value)} aria-invalid={!!errors.price} aria-describedby={errors.price ? "price-error" : "price-help"} /><small id="price-help">Input asumsi, bukan harga pasar. Estimasi kas dihitung server.</small>{fieldError("price")}</div><button type="submit" className="button full">{busy ? "Menghitung melalui API…" : "Hitung skenario"}</button></fieldset></form><aside className="scenario-notes"><Panel title="Apa yang dievaluasi?"><ol className="steps"><li>Validasi saldo dan alokasi integer.</li><li>Terapkan transaksi pada salinan snapshot.</li><li>Evaluasi ulang semua pemegang, termasuk penerima yang melintasi ambang konsentrasi.</li><li>Kembalikan rasio, dilusi, status kandidat, dan hash hasil.</li></ol><p className="muted">Browser tidak menghitung rasio, status numerik, atau kas. Jika API gagal, hasil tidak ditampilkan.</p></Panel><Limits /><Panel title="Konteks skenario"><p>Baseline: {c.snapshot.as_of_date}</p><p className="mono">{c.assessment?.rule_set_id || "Profil belum tersedia"}</p><p>Dua aksi terakhir disimpan per perusahaan dalam sesi tab ini. Perbandingan dan memo selalu dihitung ulang oleh API.</p><Link className="text-link" href={hrefs(c).compare}>Buka perbandingan <span aria-hidden="true">↗</span></Link></Panel></aside></div>{busy && <Loading>Server sedang mengevaluasi ulang seluruh ledger…</Loading>}{error && <ErrorBox error={error} retry={() => void submit()} />}{result && <section ref={resultPanel} tabIndex={-1} className="result-section" aria-label="Hasil skenario"><div className="section-heading"><h2>Hasil skenario dari mesin</h2><Badge>{result.assessment.assessment_status}</Badge></div><AssessmentMetrics assessment={result.assessment} />{!stored && <p className="notice" role="status">Penyimpanan sesi tidak tersedia. Hasil ini valid dari API, tetapi perbandingan akan memakai input preset, bukan skenario ini.</p>}<ResultDetails result={result} /><Limits assessment={result.assessment} /><details className="panel"><summary>Lihat seluruh ledger setelah skenario</summary><Ledger company={c} snapshot={result.snapshot} /></details><div className="actions"><Link className="button" href={hrefs(c).compare}>Bandingkan skenario</Link></div></section>}</>;
}
function ResultDetails({ result: r }: { result: SimulationResult }) {
  return <Panel title="Dampak & jejak perhitungan"><dl className="detail-list"><div><dt>Status numerik · derived</dt><dd>{numericLabel(r.assessment.numeric_target_status)}</dd></div><div><dt>Estimasi kas · derived</dt><dd>{r.cash_estimate_idr == null ? "Tidak diberikan (harga opsional)" : `IDR ${decimalText(r.cash_estimate_idr)}`}</dd></div><div><dt>Engine</dt><dd className="mono">{r.engine_version}</dd></div><div><dt>Hash input</dt><dd className="mono hash">{r.input_hash}</dd></div><div><dt>Hash hasil</dt><dd className="mono hash">{r.result_hash}</dd></div></dl><Dilution result={r} /></Panel>;
}
function Dilution({ result: r }: { result: SimulationResult }) {
  return <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabel perubahan kepemilikan"><table><caption>Perubahan kepemilikan · derived dari mesin</caption><thead><tr><th scope="col">Pemegang</th><th scope="col">Sebelum</th><th scope="col">Sesudah</th><th scope="col">Perubahan (poin persentase)</th></tr></thead><tbody>{r.dilution_by_holder.map(d => <tr key={d.holder_ref}><th scope="row" className="mono">{d.holder_ref}</th><td>{percent(d.old_ratio)}</td><td>{percent(d.new_ratio)}</td><td>{decimalText(d.percentage_point_change)} pp</td></tr>)}</tbody></table></div>;
}
function Compare({ company: c }: { company: Company }) {
  const [results, setResults] = useState<SimulationResult[] | null>(null);
  const [actions, setActions] = useState<ScenarioAction[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [resetError, setResetError] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); const input = comparisonActions(c);
    setActions(input); setResults(null); setError(null);
    Promise.all(input.map(action => simulate(c.code, action, controller.signal))).then(data => {
      if (data.some(r => r.assessment.rule_version !== c.assessment?.rule_version || r.assessment.rule_set_id !== c.assessment?.rule_set_id)) throw new ApiError("Versi aturan berbeda dari baseline. Perbandingan diblokir; muat ulang snapshot.");
      setResults(data);
    }).catch(e => { if (!controller.signal.aborted) setError(e); });
    return () => controller.abort();
  }, [c, attempt]);
  return <><div className="notice"><strong>Hasil selalu dihitung ulang</strong><p>Dua aksi sesi terakhir digunakan jika tersedia; slot kosong memakai input preset transfer 2 × 25.000.000 atau penerbitan 2 × 29.411.765 lembar. Hasil tersimpan tidak dipercaya sebagai hasil otoritatif.</p></div><div className="actions"><Link className="button secondary" href={hrefs(c).scenario}>Ubah input skenario</Link><button className="text-button" onClick={() => { try { sessionStorage.removeItem(storageKey(c.code)); setResetError(false); setAttempt(a => a + 1); } catch { setResetError(true); } }}>Reset input sesi ke preset</button></div>{resetError && <p role="alert" className="field-error">Penyimpanan sesi tidak dapat diakses. Reset tidak dilakukan.</p>}{error ? <ErrorBox error={error} retry={() => setAttempt(a => a + 1)} /> : !results ? <Loading>Menghitung ulang kedua alternatif melalui API…</Loading> : !c.assessment ? <Panel title="Baseline belum tersedia"><p>Tidak ada perbandingan tanpa asesmen baseline.</p></Panel> : <><div className="table-scroll comparison" tabIndex={0} role="region" aria-label="Perbandingan baseline dan dua skenario"><table><caption>Snapshot {c.snapshot.as_of_date} · {c.assessment.rule_set_id} · {c.assessment.rule_version}</caption><thead><tr><th scope="col">Metrik</th><th scope="col">Baseline<small>Snapshot tetap</small></th>{results.map((r, i) => <th scope="col" key={i}>Skenario {i === 0 ? "A" : "B"}<small>{r.action.action_type === "TRANSFER" ? "Transfer saham" : "Penerbitan baru"}</small></th>)}</tr></thead><tbody><tr><th scope="row">Total saham · derived</th>{[c.assessment, ...results.map(r => r.assessment)].map((a, i) => <td key={i}>{integer(a.total_shares)}</td>)}</tr><tr><th scope="row">Saham eligible · derived</th>{[c.assessment, ...results.map(r => r.assessment)].map((a, i) => <td key={i}>{integer(a.eligible_shares)}</td>)}</tr><tr className="ratio-row"><th scope="row">Rasio free float · derived</th>{[c.assessment, ...results.map(r => r.assessment)].map((a, i) => <td key={i}>{percent(a.free_float_ratio)}</td>)}</tr><tr><th scope="row">Target profil · input</th>{[c.assessment, ...results.map(r => r.assessment)].map((a, i) => <td key={i}>{percent(a.target_ratio)}</td>)}</tr><tr><th scope="row">Status target numerik · derived</th>{[c.assessment, ...results.map(r => r.assessment)].map((a, i) => <td key={i}>{numericLabel(a.numeric_target_status)}<small>{a.numeric_target_status}</small></td>)}</tr><tr><th scope="row">Status asesmen</th>{[c.assessment, ...results.map(r => r.assessment)].map((a, i) => <td key={i}><Badge>{a.assessment_status}</Badge></td>)}</tr><tr><th scope="row">Estimasi kas IDR · derived</th><td>Tidak berlaku</td>{results.map((r, i) => <td key={i}>{r.cash_estimate_idr == null ? "Harga tidak diisi" : decimalText(r.cash_estimate_idr)}</td>)}</tr><tr><th scope="row">Gap target & saham non-free</th><td colSpan={3}>Tidak disediakan sebagai metrik terpisah oleh API; tidak dihitung di browser.</td></tr><tr><th scope="row">Hash hasil / data</th><td className="mono hash">{c.assessment.data_hash}</td>{results.map((r, i) => <td key={i} className="mono hash">{r.result_hash}</td>)}</tr></tbody></table></div><div className="two-columns bottom-space">{results.map((r, i) => <Panel key={i} title={`Skenario ${i === 0 ? "A" : "B"} · input & dilusi`}><dl className="detail-list">{actions[i]?.allocations.map(a => <div key={a.holder_ref}><dt className="mono">{a.holder_ref}</dt><dd>{integer(a.shares)} lembar · {a.eligibility}<small>Asumsi sintetis: {a.evidence_ref}</small></dd></div>)}</dl><Dilution result={r} /><Limits assessment={r.assessment} /></Panel>)}</div><Limits assessment={c.assessment} /><div className="actions"><Link className="button" href={hrefs(c).report}>Buat memo berbukti</Link></div></>}</>;
}
function Report({ company: c }: { company: Company }) {
  const [report, setReport] = useState<ReportResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [downloadError, setDownloadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setReport(null); setError(null);
    generateReport(c.code, comparisonActions(c), controller.signal).then(setReport).catch(e => { if (!controller.signal.aborted) setError(e); });
    return () => controller.abort();
  }, [c, attempt]);
  function download() {
    if (!report) return;
    try {
      const url = URL.createObjectURL(new Blob([report.markdown_content], { type: "text/markdown;charset=utf-8" }));
      const a = document.createElement("a"); a.href = url; a.download = `DEMO-${c.code.replace(/^DEMO-/, "")}-${report.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80)}.md`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setDownloadError(true); }
  }
  return <><div className="notice"><strong>SIMULATION ONLY — NOT OFFICIAL FILING</strong><p>Memo dibuat ulang oleh API dari baseline dan aksi sesi/preset. URL ini bukan arsip persetujuan reviewer. AI tidak tersedia; memo deterministik adalah fallback manual.</p></div>{error ? <ErrorBox error={error} retry={() => setAttempt(a => a + 1)} /> : !report ? <Loading>Menyusun memo deterministik melalui API…</Loading> : <><div className="section-heading"><div><h2>Pratinjau memo</h2><p className="mono muted">Versi / ID: {report.id}</p></div><button className="button" onClick={download}>Unduh Markdown</button></div>{downloadError && <p className="field-error" role="alert">Unduhan tidak dapat dibuat. Salin teks memo dari pratinjau.</p>}<pre className="memo" tabIndex={0} aria-label="Isi memo Markdown dari API">{report.markdown_content}</pre><Panel title="Referensi sumber dari API">{report.sources.length ? <ul className="source-list">{report.sources.map((s, i) => <li key={i} className="mono">{typeof s === "string" ? s : JSON.stringify(s)}</li>)}</ul> : <p>Referensi sumber belum diberikan API. Validasi sumber tetap diperlukan.</p>}<p className="muted">Konten ditampilkan sebagai teks, bukan HTML. Referensi fixture bukan sertifikat atau dokumen regulator.</p></Panel><div className="actions"><Link href={hrefs(c).compare} className="button secondary">Kembali ke perbandingan</Link></div></>}</>;
}
