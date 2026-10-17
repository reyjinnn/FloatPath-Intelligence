"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type {
  Assessment,
  Company,
  ScenarioAction,
  SimulationResult,
  ReportResult,
  Eligibility,
  HolderType,
  Flag,
  Holder,
  Session,
  SnapshotRecord,
  Comparison,
  AuditEventRecord,
  WorkspaceUser,
  UserRole,
} from "./types/api";
import {
  ApiError,
  assessmentLabel,
  companyLabel,
  compareScenarios,
  createDraft,
  createWorkspaceUser,
  decimalText,
  generateReport,
  getAuditEvents,
  getCompanies,
  getCompany,
  getReport,
  getReports,
  getScenarios,
  getSession,
  getSnapshot,
  getWorkspaceUsers,
  holderLabel,
  importHoldings,
  integer,
  lockSnapshot,
  logout,
  numericLabel,
  percent,
  priceValid,
  roleLabel,
  saveHoldings,
  sharesInput,
  simulate,
  updateWorkspaceUserRole,
  validateLedger,
} from "./lib";

type Screen = "workspace" | "company" | "verify" | "assessment" | "scenario" | "compare" | "reports" | "report" | "audit" | "team";

const screenNames: Record<Screen, string> = {
  workspace: "Portofolio perusahaan",
  company: "Ringkasan perusahaan",
  verify: "Tinjau data kepemilikan",
  assessment: "Asesmen free float",
  scenario: "Buat skenario",
  compare: "Bandingkan skenario",
  reports: "Arsip laporan",
  report: "Laporan analisis",
  audit: "Jejak Audit & Tata Kelola",
  team: "Manajemen Tim & Otorisasi",
};

const descriptions: Record<Screen, string> = {
  workspace: "Pantau posisi kepemilikan dan lanjutkan pekerjaan pada setiap perusahaan.",
  company: "Posisi terkini, kesiapan data, dan aktivitas analisis perusahaan.",
  verify: "Periksa ledger, simpan tinjauan, lalu tetapkan versi data untuk analisis.",
  assessment: "Posisi free float terhadap target numerik dan hal yang masih perlu diverifikasi.",
  scenario: "Susun alokasi untuk menilai dampaknya terhadap kepemilikan dan free float.",
  compare: "Pilih dua skenario tersimpan dengan versi baseline yang sama.",
  reports: "Laporan tersimpan dan referensi analisis yang dapat dibuka kembali.",
  report: "Dokumen analisis tersimpan dengan sumber dan jejak perhitungan.",
  audit: "Catatan mutasi imutabel dan jejak kriptografis SHA-256 untuk tata kelola kepatuhan.",
  team: "Pengaturan pengguna workspace, penetapan wewenang peran (RBAC), dan matriks kapabilitas.",
};

const hrefs = (c: Company) => {
  const query = `company=${encodeURIComponent(c.id)}`;
  return {
    company: `/companies/${encodeURIComponent(c.id)}`,
    verify: `/snapshots/${encodeURIComponent(c.snapshot.id)}/verify?${query}`,
    assessment: `/assessments/${encodeURIComponent(c.snapshot.id)}?${query}`,
    scenario: `/scenarios/new?${query}`,
    compare: `/scenarios/compare?${query}`,
    reports: `/reports?${query}`,
  };
};

function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <strong>Permintaan belum berhasil {error instanceof ApiError && error.status ? `(${error.status})` : ""}</strong>
      <p>{error instanceof Error ? error.message : "Terjadi kesalahan yang tidak dikenal."}</p>
      {error instanceof ApiError && error.correlationId && (
        <small className="mono">ID permintaan: {error.correlationId}</small>
      )}
      {retry && <button className="button secondary" onClick={retry}>Coba lagi</button>}
    </div>
  );
}

function Loading({ children = "Memuat ruang kerja…" }: { children?: ReactNode }) {
  return (
    <div className="loading" role="status">
      <span className="loader" aria-hidden="true" />
      {children}
    </div>
  );
}

function Panel({ title, children, className = "", style }: { title: string; children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return <section className={`panel ${className}`} style={style}><h2>{title}</h2>{children}</section>;
}

function Badge({ children, tone = "", style }: { children: ReactNode; tone?: string; style?: React.CSSProperties }) {
  return <span className={`badge ${tone}`} style={style}>{children}</span>;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function AssessmentMetrics({ assessment: a }: { assessment: Assessment }) {
  return (
    <div className="metrics">
      <Metric label="Total saham" value={integer(a.total_shares)} note="Lembar saham" />
      <Metric label="Saham eligible" value={integer(a.eligible_shares)} note="Berdasarkan klasifikasi ledger" />
      <Metric label="Rasio free float" value={percent(a.free_float_ratio)} note={numericLabel(a.numeric_target_status)} />
      <Metric label="Target numerik" value={percent(a.target_ratio)} note="Profil analisis belum terverifikasi" />
    </div>
  );
}

function Limits({ assessment }: { assessment?: Assessment }) {
  return (
    <aside className="notice">
      <strong>Batas penilaian</strong>
      <p>Data dan bukti pada workspace ini sintetis. Hasil menunjukkan posisi numerik, bukan penilaian kepatuhan hukum, rekomendasi investasi, atau dokumen resmi. Kelayakan pemegang dan penerapan aturan nyata belum diverifikasi.</p>
      {assessment && (assessment.warnings.length > 0 || assessment.unresolved_constraints.length > 0) && (
        <details>
          <summary>Hal yang perlu ditindaklanjuti</summary>
          <ul>{[...assessment.warnings, ...assessment.unresolved_constraints].map((item, i) => <li key={i}>{item}</li>)}</ul>
        </details>
      )}
    </aside>
  );
}

function Provenance({ company: c }: { company: Company }) {
  return (
    <details className="provenance">
      <summary>Detail sumber & versi data</summary>
      <dl className="detail-list">
        <div><dt>Snapshot</dt><dd>{c.snapshot.as_of_date}</dd></div>
        <div><dt>Sumber</dt><dd>Dataset sintetis, bukan data pasar atau identitas pemegang nyata</dd></div>
        <div><dt>ID snapshot</dt><dd className="mono">{c.snapshot.id}</dd></div>
        {c.assessment && (
          <>
            <div><dt>Hash data</dt><dd className="mono">{c.assessment.data_hash}</dd></div>
            <div><dt>Profil / versi</dt><dd>{c.assessment.rule_set_id} / {c.assessment.rule_version}</dd></div>
            <div><dt>Status internal</dt><dd>{c.assessment.assessment_status} · {c.assessment.rule_status}</dd></div>
          </>
        )}
      </dl>
    </details>
  );
}

export default function Workspace({ screen, resource, companyCode }: { screen: Screen; resource?: string; companyCode?: string }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotRecord | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setSession(null); setError(null); setCompany(null); setCompanies(null); setSnapshot(null);
    async function load() {
      const auth = await getSession(controller.signal);
      if (controller.signal.aborted) return;
      setSession(auth);
      if (screen === "workspace") {
        const list = await getCompanies(controller.signal);
        if (!controller.signal.aborted) setCompanies(list);
        return;
      }
      if (screen === "audit" || screen === "team") {
        return;
      }
      let id = companyCode || (screen === "company" ? resource : undefined);
      let version: SnapshotRecord | null = null;
      if (resource && ["verify", "assessment"].includes(screen)) {
        version = await getSnapshot(resource, controller.signal);
        id = id || version.company_id;
      }
      if (!id && screen === "report") return;
      if (!id) throw new ApiError("Pilih perusahaan dari portofolio untuk melanjutkan.");
      const data = await getCompany(id, controller.signal);
      version = version || await getSnapshot(data.snapshot.id, controller.signal);
      if (version.company_id !== data.id) throw new ApiError("Versi ledger tidak sesuai dengan perusahaan yang dipilih.");
      if (controller.signal.aborted) return;
      setSnapshot(version);
      setCompany({
        ...data,
        snapshot: version.snapshot,
        snapshot_state: version.status,
        assessment: version.id === data.snapshot.id ? data.assessment : undefined,
      });
    }
    load().catch(e => {
      if (!controller.signal.aborted && !(e instanceof ApiError && e.status === 401)) setError(e);
    });
    return () => controller.abort();
  }, [screen, resource, companyCode, attempt]);

  async function signOut() {
    setLoggingOut(true);
    try {
      await logout();
      setSession(null); setCompany(null); setCompanies(null);
      router.replace("/login"); router.refresh();
    } catch (e) {
      setError(e);
      setLoggingOut(false);
    }
  }

  const links = company ? hrefs(company) : null;
  if (!session) {
    return (
      <main className="auth-loading">
        {error ? <ErrorBox error={error} retry={() => setAttempt(a => a + 1)} /> : <Loading>Memeriksa sesi…</Loading>}
      </main>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Lewati ke konten</a>
      <aside className="sidebar">
        <Link href="/workspace" className="brand" aria-label="FloatPath, portofolio">
          <span className="brand-mark" aria-hidden="true">fp</span>
          <span>FloatPath<small>INTELLIGENCE</small></span>
        </Link>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Navigasi utama">
          <Link href="/workspace" aria-current={screen === "workspace" ? "page" : undefined}>Portofolio</Link>
          {(["company", "verify", "assessment", "scenario", "compare", "reports"] as const).map(s => links ? (
            <Link key={s} href={links[s]} aria-current={screen === s || (s === "reports" && screen === "report") ? "page" : undefined}>
              {screenNames[s]}
            </Link>
          ) : (
            <span className="nav-disabled" key={s}>{screenNames[s]}</span>
          ))}

          <p className="nav-label" style={{ marginTop: "16px" }}>TATA KELOLA</p>
          {["admin", "reviewer", "viewer"].includes(session.user.role) && (
            <Link href="/audit" aria-current={screen === "audit" ? "page" : undefined}>Jejak Audit</Link>
          )}
          {session.user.role === "admin" && (
            <Link href="/team" aria-current={screen === "team" ? "page" : undefined}>Tim & Pengguna</Link>
          )}
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" aria-hidden="true" />
          <strong>{session.workspace.name}</strong>
          <p>Ownership & free-float analysis</p>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">OWNERSHIP WORKSPACE</span>
            <p>
              {company ? companyLabel(company) : "FloatPath"}
              <span className="breadcrumb-separator" aria-hidden="true">/</span>
              {screen === "workspace" ? "Portofolio" : screenNames[screen]}
            </p>
          </div>
          <div className="account">
            <span className="data-pill">Data sintetis</span>
            <div className="account-name">
              <strong>@{session.user.username}</strong>
              <span className={`role-badge ${session.user.role}`} style={{ display: "inline-block", marginTop: "2px" }}>
                {roleLabel(session.user.role)}
              </span>
            </div>
            <button className="text-button" onClick={signOut} disabled={loggingOut}>
              {loggingOut ? "Keluar…" : "Keluar"}
            </button>
          </div>
        </header>

        <main id="main" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <p className="eyebrow">{company ? companyLabel(company) : "FLOATPATH INTELLIGENCE"}</p>
              <h1>{screenNames[screen]}</h1>
              <p>{descriptions[screen]}</p>
            </div>
            {company && (
              <Badge tone={snapshot?.status === "LOCKED" ? "locked" : "draft"}>
                {snapshot?.status === "LOCKED" ? "Snapshot terkunci" : "Draft ledger"}
              </Badge>
            )}
          </div>

          {!!error && <ErrorBox error={error} retry={() => setAttempt(a => a + 1)} />}

          {screen === "workspace" && !error && !companies && <Loading>Memuat portofolio perusahaan…</Loading>}
          {screen === "workspace" && companies && <Portfolio companies={companies} />}
          {screen === "company" && company && <Overview company={company} />}
          {screen === "verify" && company && snapshot && (
            <Verify company={company} initial={snapshot} role={session.user.role} onLocked={setSnapshot} />
          )}
          {screen === "assessment" && company && <AssessmentView company={company} />}
          {screen === "scenario" && company && (
            <ScenarioForm company={company} locked={snapshot?.status === "LOCKED"} role={session.user.role} />
          )}
          {screen === "compare" && company && <Compare company={company} />}
          {screen === "reports" && company && <Reports company={company} />}
          {screen === "report" && <Report resource={resource} company={company} />}
          {screen === "audit" && <AuditTrailView session={session} />}
          {screen === "team" && <TeamManagementView session={session} />}
        </main>
      </div>
    </div>
  );
}

function Portfolio({ companies }: { companies: Company[] }) {
  const drafts = companies.filter(c => (c.snapshot_state || c.snapshot_status) === "DRAFT").length;
  const needsReview = companies.filter(c => c.assessment?.numeric_target_status !== "PASS_NUMERIC").length;
  return (
    <>
      <div className="metrics portfolio-metrics">
        <Metric label="Perusahaan" value={integer(companies.length)} note="Dalam portofolio workspace" />
        <Metric label="Draft ledger" value={integer(drafts)} note="Menunggu tinjauan dan penguncian" />
        <Metric label="Perlu perhatian numerik" value={integer(needsReview)} note="Di bawah target atau belum dinilai" />
      </div>
      <div className="section-heading">
        <h2>Daftar perusahaan</h2>
        <span className="muted">{companies.length} perusahaan sintetis</span>
      </div>
      {companies.length === 0 ? (
        <Panel title="Portofolio belum tersedia">
          <p>Belum ada perusahaan di workspace. Minta pengelola menambahkan dataset sintetis untuk memulai analisis.</p>
        </Panel>
      ) : (
        <div className="company-grid">
          {companies.map(c => (
            <article key={c.id} className="company-card">
              <div className="card-top">
                <span className="company-monogram" aria-hidden="true">{companyLabel(c).slice(0, 2)}</span>
                <Badge tone={(c.snapshot_state || c.snapshot_status) === "DRAFT" ? "draft" : ""}>
                  {(c.snapshot_state || c.snapshot_status) === "DRAFT" ? "Draft" : "Terkunci"}
                </Badge>
              </div>
              <p className="eyebrow">{companyLabel(c)}</p>
              <h3>{c.legal_name}</h3>
              <p className="muted">Posisi {c.snapshot.as_of_date}</p>
              <dl className="card-stats">
                <div><dt>Rasio free float</dt><dd>{c.assessment ? percent(c.assessment.free_float_ratio) : "Belum tersedia"}</dd></div>
                <div><dt>Total saham</dt><dd>{integer(c.snapshot.total_shares)}</dd></div>
              </dl>
              <p className="card-status">{c.assessment ? numericLabel(c.assessment.numeric_target_status) : "Asesmen belum tersedia"}</p>
              <Link className="button card-link" href={hrefs(c).company}>Buka perusahaan<span aria-hidden="true">↗</span></Link>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function Overview({ company: c }: { company: Company }) {
  return (
    <>
      {c.assessment ? <AssessmentMetrics assessment={c.assessment} /> : (
        <Panel title="Asesmen belum tersedia"><p>Validasi ledger untuk memeriksa kesiapan data sebelum analisis.</p></Panel>
      )}
      <div className="two-columns">
        <Panel title="Posisi kepemilikan">
          <dl className="detail-list">
            <div><dt>Perusahaan</dt><dd>{c.legal_name}</dd></div>
            <div><dt>Tanggal snapshot</dt><dd>{c.snapshot.as_of_date}</dd></div>
            <div><dt>Jumlah pemegang dalam ledger</dt><dd>{integer(c.snapshot.holders.length)} baris</dd></div>
            <div><dt>Jumlah SID</dt><dd>{integer(c.snapshot.sid_count)}<small>Input dataset, bukan baris ledger.</small></dd></div>
            <div><dt>Status versi</dt><dd>{c.snapshot_state === "LOCKED" ? "Terkunci untuk analisis" : "Draft, dapat ditinjau"}</dd></div>
          </dl>
          <div className="actions">
            <Link className="button" href={hrefs(c).verify}>Tinjau ledger</Link>
            <Link className="button secondary" href={hrefs(c).assessment}>Lihat asesmen</Link>
          </div>
        </Panel>
        <Panel title="Aktivitas analisis">
          <div className="workflow-row"><span className="step-number">01</span><div><h3>Siapkan versi data</h3><p>Tinjau klasifikasi dan bukti; kunci snapshot setelah validasi.</p></div></div>
          <div className="workflow-row"><span className="step-number">02</span><div><h3>Susun alternatif</h3><p>Simpan skenario transfer atau penerbitan pada baseline terkunci.</p></div></div>
          <div className="workflow-row"><span className="step-number">03</span><div><h3>Dokumentasikan hasil</h3><p>Bandingkan skenario dan simpan memo tata kelola resmi.</p></div></div>
          <div className="actions">
            <Link className="button secondary" href={hrefs(c).compare}>Skenario tersimpan</Link>
            <Link className="text-link" href={hrefs(c).reports}>Arsip laporan</Link>
          </div>
        </Panel>
      </div>
    </>
  );
}

const flagFields = [["controller", "Pengendali"], ["controller_affiliate", "Afiliasi pengendali"], ["director_commissioner", "Direksi/komisaris"], ["treasury", "Treasury"], ["restricted", "Terbatas"]] as const;
const flagValue = (value: Flag | undefined) => value === true || value === "TRUE" ? "TRUE" : value === false || value === "FALSE" ? "FALSE" : "UNKNOWN";
const eligibilityLabel = (value: Eligibility) => ({ ELIGIBLE: "Eligible", INELIGIBLE: "Tidak eligible", UNKNOWN: "Belum diketahui" })[value];

function OwnershipBreakdown({ holders, totalShares }: { holders: Holder[]; totalShares: number }) {
  const controllerShares = holders.filter(h => h.controller === "TRUE" || h.controller === true).reduce((acc, h) => acc + h.shares, 0);
  const affiliateShares = holders.filter(h => (h.controller_affiliate === "TRUE" || h.controller_affiliate === true || h.director_commissioner === "TRUE" || h.director_commissioner === true) && !(h.controller === "TRUE" || h.controller === true)).reduce((acc, h) => acc + h.shares, 0);
  const treasuryShares = holders.filter(h => (h.treasury === "TRUE" || h.treasury === true || h.restricted === "TRUE" || h.restricted === true) && !(h.controller === "TRUE" || h.controller === true)).reduce((acc, h) => acc + h.shares, 0);
  const eligibleShares = holders.filter(h => h.eligibility === "ELIGIBLE").reduce((acc, h) => acc + h.shares, 0);
  const totalRecorded = holders.reduce((acc, h) => acc + h.shares, 0);
  const reconciled = totalRecorded === totalShares;

  return (
    <div className="category-breakdown">
      <div className="category-card">
        <span>Pengendali</span>
        <strong>{integer(controllerShares)}</strong>
        <small>{totalShares > 0 ? (controllerShares / totalShares * 100).toFixed(2) + "%" : "—"}</small>
      </div>
      <div className="category-card">
        <span>Afiliasi & Direksi/Komisaris</span>
        <strong>{integer(affiliateShares)}</strong>
        <small>{totalShares > 0 ? (affiliateShares / totalShares * 100).toFixed(2) + "%" : "—"}</small>
      </div>
      <div className="category-card">
        <span>Treasury & Terbatas</span>
        <strong>{integer(treasuryShares)}</strong>
        <small>{totalShares > 0 ? (treasuryShares / totalShares * 100).toFixed(2) + "%" : "—"}</small>
      </div>
      <div className="category-card" style={{ borderLeft: "3px solid #087d79" }}>
        <span>Publik Eligible (Free Float)</span>
        <strong style={{ color: "#087d79" }}>{integer(eligibleShares)}</strong>
        <small>{totalShares > 0 ? (eligibleShares / totalShares * 100).toFixed(2) + "%" : "—"}</small>
      </div>
      <div className="category-card">
        <span>Status Rekonsiliasi</span>
        <strong style={{ color: reconciled ? "#087d79" : "#a52936" }}>{reconciled ? "100% Seimbang" : "Ada Selisih"}</strong>
        <small>{reconciled ? "Total ledger cocok" : `Selisih ${integer(Math.abs(totalShares - totalRecorded))} lembar`}</small>
      </div>
    </div>
  );
}

function Verify({ company: c, initial, role, onLocked }: { company: Company; initial: SnapshotRecord; role: UserRole; onLocked: (record: SnapshotRecord) => void }) {
  const router = useRouter();
  const [record, setRecord] = useState(initial);
  const [rows, setRows] = useState(initial.snapshot.holders);
  const [shareValues, setShareValues] = useState(initial.snapshot.holders.map(h => String(h.shares)));
  const [dirty, setDirty] = useState(false);
  const [validated, setValidated] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [file, setFile] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const isViewer = role === "viewer";
  const isReviewerOrAdmin = role === "reviewer" || role === "admin";
  const editable = record.status === "DRAFT" && !isViewer;
  const evidenceRefs = [...new Set(initial.snapshot.holders.map(h => h.evidence_ref).filter((v): v is string => !!v))];

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty || busy) event.preventDefault(); };
    const navigate = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (dirty && link instanceof HTMLAnchorElement && link.href !== window.location.href && !link.hash && !window.confirm("Perubahan ledger belum tersimpan. Tinggalkan halaman dan buang perubahan?")) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", navigate, true); };
  }, [dirty, busy]);

  function edit(index: number, value: Partial<Holder>) {
    setRows(items => items.map((h, i) => i === index ? { ...h, ...value } : h));
    setDirty(true); setValidated(false); setConfirmed(false); setMessage("");
  }

  async function refresh() {
    const next = await getSnapshot(record.id);
    setRecord(next); setRows(next.snapshot.holders); setShareValues(next.snapshot.holders.map(h => String(h.shares))); setDirty(false);
    return next;
  }

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(null); setMessage("");
    try { await action(); } catch (e) { setError(e); } finally { setBusy(false); }
  }

  async function save() {
    await run(async () => {
      const holders = rows.map((h, i) => {
        const shares = /^0+$/.test(shareValues[i]) ? 0 : sharesInput(shareValues[i]);
        if (shares === null) throw new ApiError(`Saham ${holderLabel(h.holder_ref)} harus berupa bilangan bulat nonnegatif yang aman.`);
        return { ...h, shares };
      });
      await saveHoldings(record.id, holders);
      await refresh();
      setValidated(false);
      setMessage("Tinjauan tersimpan. Jalankan validasi sebelum penguncian.");
    });
  }

  async function upload() {
    await run(async () => {
      if (!file || !/\.csv$/i.test(file.name)) throw new ApiError("Pilih berkas dengan ekstensi .csv.");
      if (file.size === 0 || file.size > 5 * 1024 * 1024) throw new ApiError("Ukuran CSV harus lebih dari 0 dan maksimal 5 MiB.");
      const content = await file.text();
      if (content.includes("\u0000")) throw new ApiError("CSV mengandung karakter biner yang tidak didukung.");
      await importHoldings(record.id, content);
      await refresh();
      setFile(null);
      if (input.current) input.current.value = "";
      setValidated(false); setConfirmed(false);
      setMessage("CSV tersimpan. Ledger berhasil diperbarui; jalankan validasi untuk melanjutkan.");
    });
  }

  async function validate() {
    await run(async () => {
      const result = await validateLedger(record.id);
      setValidated(result.valid);
      if (!result.valid) throw new ApiError(result.errors.join("; ") || "Ledger belum valid. Periksa rekonsiliasi dan klasifikasi pemegang.");
      setMessage("Validasi berhasil. Ledger siap ditetapkan sebagai versi terkunci.");
    });
  }

  async function lock() {
    if (!validated || dirty || !confirmed || !isReviewerOrAdmin) return;
    await run(async () => {
      await lockSnapshot(record.id);
      const next = await refresh();
      onLocked(next);
      setMessage("Versi ledger telah berhasil dikunci dengan hash SHA-256 imutabel. Skenario kini dapat dijalankan.");
    });
  }

  async function revise() {
    await run(async () => {
      const draft = await createDraft({ ...c, snapshot: record.snapshot });
      router.push(`/snapshots/${encodeURIComponent(draft.id)}/verify?company=${encodeURIComponent(c.id)}`);
    });
  }

  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Ledger kepemilikan</h2>
          <p className="muted">Posisi {record.snapshot.as_of_date} · total {integer(record.snapshot.total_shares)} lembar saham</p>
        </div>
        {!editable && !isViewer && <button className="button" onClick={revise} disabled={busy}>Buat revisi draft</button>}
      </div>

      <OwnershipBreakdown holders={rows} totalShares={record.snapshot.total_shares} />

      {!!error && <ErrorBox error={error} />}
      {message && <p className="success-message" role="status">{message}</p>}

      {isViewer && (
        <div className="notice subtle" style={{ borderLeft: "4px solid #475569" }}>
          <strong>Mode Pemirsa / Auditor Eksternal (Read-Only)</strong>
          <p>Anda dapat menginspeksi ledger kepemilikan dan bukti sumber, namun pengeditan lembar saham, impor CSV, dan penguncian versi dinonaktifkan untuk peran Anda.</p>
        </div>
      )}

      {editable && (
        <div className="notice subtle">
          <strong>Draft dapat diubah</strong>
          <p>Perubahan hanya tersimpan permanen setelah tinjauan disimpan atau CSV berhasil diimpor. Versi terkunci sebelumnya tetap utuh.</p>
        </div>
      )}

      <div className="table-scroll ledger" tabIndex={0} role="region" aria-label="Ledger kepemilikan, dapat digulir horizontal">
        <table>
          <caption>Ledger {companyLabel(c)}{dirty ? " · ada perubahan belum tersimpan" : ""}</caption>
          <thead>
            <tr>
              <th scope="col">Pemegang</th>
              <th scope="col">Saham (lembar)</th>
              <th scope="col">Kelayakan / tipe</th>
              <th scope="col">Klasifikasi</th>
              <th scope="col">Referensi bukti</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h, i) => (
              <tr key={h.holder_ref}>
                <th scope="row">
                  {holderLabel(h.holder_ref)}
                  <small className="mono">{h.holder_ref}</small>
                </th>
                <td className="number">
                  {editable ? (
                    <input
                      aria-label={`Saham ${holderLabel(h.holder_ref)}`}
                      inputMode="numeric"
                      disabled={busy}
                      value={shareValues[i]}
                      onChange={e => {
                        setShareValues(values => values.map((v, j) => j === i ? e.target.value : v));
                        edit(i, {});
                      }}
                    />
                  ) : (
                    integer(h.shares)
                  )}
                </td>
                <td>
                  {editable ? (
                    <div className="stack-fields">
                      <select
                        aria-label={`Kelayakan ${holderLabel(h.holder_ref)}`}
                        disabled={busy}
                        value={h.eligibility}
                        onChange={e => edit(i, { eligibility: e.target.value as Eligibility })}
                      >
                        {(["ELIGIBLE", "INELIGIBLE", "UNKNOWN"] as const).map(v => (
                          <option key={v} value={v}>{eligibilityLabel(v)}</option>
                        ))}
                      </select>
                      <select
                        aria-label={`Tipe ${holderLabel(h.holder_ref)}`}
                        disabled={busy}
                        value={h.holder_type}
                        onChange={e => edit(i, { holder_type: e.target.value })}
                      >
                        {[...new Set([h.holder_type, "ORGANIZATION", "PERSON"])].map(v => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <>
                      <Badge tone={h.eligibility === "ELIGIBLE" ? "eligible" : "ineligible"}>
                        {eligibilityLabel(h.eligibility)}
                      </Badge>
                      <small className="muted" style={{ display: "block" }}>{h.holder_type}</small>
                    </>
                  )}
                </td>
                <td>
                  {editable ? (
                    <div className="flag-stack">
                      {flagFields.map(([k, label]) => (
                        <label key={k}>
                          <span>{label}</span>
                          <select
                            disabled={busy}
                            value={flagValue(h[k])}
                            onChange={e => edit(i, { [k]: e.target.value as Flag })}
                          >
                            <option value="FALSE">Tidak</option>
                            <option value="TRUE">Ya</option>
                            <option value="UNKNOWN">Belum diketahui</option>
                          </select>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="flag-summary">
                      {flagFields.filter(([k]) => flagValue(h[k]) === "TRUE").map(([k, label]) => (
                        <span key={k} className="flag-chip">{label}</span>
                      ))}
                      {flagFields.every(([k]) => flagValue(h[k]) !== "TRUE") && <span className="muted small">—</span>}
                    </div>
                  )}
                </td>
                <td>
                  {editable ? (
                    <select
                      aria-label={`Referensi bukti ${holderLabel(h.holder_ref)}`}
                      disabled={busy}
                      value={h.evidence_ref || ""}
                      onChange={e => edit(i, { evidence_ref: e.target.value || null })}
                    >
                      <option value="">(Belum ada referensi bukti)</option>
                      {evidenceRefs.map(ref => <option key={ref} value={ref}>{ref}</option>)}
                    </select>
                  ) : (
                    <span className="mono small">{h.evidence_ref || "Belum ada referensi bukti"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editable && (
        <Panel title="Aksi Pembaruan Ledger">
          <div className="actions" style={{ marginBottom: "16px" }}>
            <button className="button" onClick={save} disabled={busy}>
              {busy ? "Menyimpan…" : "Simpan tinjauan"}
            </button>
            <button className="button secondary" onClick={validate} disabled={busy}>
              {busy ? "Memvalidasi…" : "Validasi ledger"}
            </button>
          </div>
          <div className="file-field">
            <label htmlFor="csv-upload">Impor CSV Kepemilikan (Maksimal 5 MiB)</label>
            <input
              id="csv-upload"
              ref={input}
              type="file"
              accept=".csv"
              disabled={busy}
              onChange={e => setFile(e.target.files?.[0] || null)}
            />
            {file && (
              <button className="button secondary" type="button" onClick={upload} disabled={busy}>
                {busy ? "Mengunggah…" : `Impor ${file.name}`}
              </button>
            )}
          </div>
        </Panel>
      )}

      {record.status === "LOCKED" && (
        <Panel title="Snapshot Terkunci">
          <p><span className="badge locked" style={{ marginRight: "8px" }}>Snapshot terkunci</span> Versi ledger ini telah dikunci dengan hash SHA-256 dan siap digunakan untuk skenario.</p>
          <div className="actions" style={{ marginTop: "12px" }}>
            <Link className="button" href={hrefs(c).assessment}>Lanjut ke asesmen</Link>
          </div>
        </Panel>
      )}

      {editable && (
        <Panel title="Penguncian Versi Data (Reviewer / Admin)">
          <p className="muted small">
            Setelah tervalidasi dan dikunci, versi ledger ini menjadi imutabel (tidak dapat diubah) dan menghasilkan hash SHA-256 untuk memastikan integritas bukti.
          </p>
          <label className="checkbox-row" style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="checkbox"
              id="confirm-lock-checkbox"
              checked={confirmed}
              disabled={!validated || busy || !isReviewerOrAdmin}
              onChange={e => setConfirmed(e.target.checked)}
            />
            <span>Saya telah meninjau ledger dan memahami bahwa penguncian hanya menetapkan versi data.</span>
          </label>
          <div className="actions" style={{ marginTop: "14px" }}>
            <button className="button" onClick={lock} disabled={!validated || !confirmed || busy || !isReviewerOrAdmin}>
              {busy ? "Mengunci…" : "Kunci snapshot"}
            </button>
            {!isReviewerOrAdmin && !isViewer && (
              <span className="small muted">(Penguncian resmi memerlukan peran Reviewer atau Admin)</span>
            )}
          </div>
        </Panel>
      )}
    </>
  );
}

function AssessmentView({ company: c }: { company: Company }) {
  const a = c.assessment;
  if (!a) {
    return (
      <Panel title="Asesmen versi ini belum tersedia">
        <p>Buka ringkasan terbaru atau tinjau ledger untuk melanjutkan.</p>
        <Link href={hrefs(c).company} className="button secondary">Ringkasan perusahaan</Link>
      </Panel>
    );
  }
  return (
    <>
      <AssessmentMetrics assessment={a} />
      <div className="two-columns">
        <Panel title="Hasil penilaian numerik">
          <p className="assessment-status">{numericLabel(a.numeric_target_status)}</p>
          <dl className="detail-list">
            <div><dt>Lingkup analisis</dt><dd>{assessmentLabel(a.assessment_status)}</dd></div>
            <div><dt>Jumlah SID</dt><dd>{integer(c.snapshot.sid_count)}<small>Berdasarkan input dataset.</small></dd></div>
            <div><dt>Kesiapan aturan hukum</dt><dd>Belum terverifikasi</dd></div>
            <div><dt>Snapshot</dt><dd>{c.snapshot_state === "LOCKED" ? "Terkunci untuk skenario" : "Draft, belum dapat digunakan untuk skenario"}</dd></div>
          </dl>
        </Panel>
        <Panel title="Tindak lanjut">
          <p>Tinjau asumsi kelayakan dan klasifikasi pemegang sebelum menyusun alternatif alokasi.</p>
          <p>Perubahan kepemilikan pada skenario akan dievaluasi kembali pada seluruh ledger, termasuk penerima yang melewati ambang profil 5%.</p>
          <div className="actions">
            <Link href={hrefs(c).verify} className="button secondary">Tinjau ledger</Link>
            <Link href={hrefs(c).scenario} className="button">Buat skenario</Link>
          </div>
        </Panel>
      </div>
      <Limits assessment={a} />
    </>
  );
}

function ScenarioForm({ company: c, locked, role }: { company: Company; locked: boolean; role?: UserRole }) {
  const holders = c.snapshot.holders.filter(h => !h.holder_type.toUpperCase().includes("AGGREGATE") && !h.holder_ref.includes("BUCKET"));
  const [type, setType] = useState<ScenarioAction["action_type"]>("TRANSFER");
  const [seller, setSeller] = useState(holders[0]?.holder_ref || "");
  const [refs, setRefs] = useState(["DEMO-NEW-A", "DEMO-NEW-B"]);
  const [amounts, setAmounts] = useState(["", ""]);
  const [eligibilities, setEligibilities] = useState<Eligibility[]>(["UNKNOWN", "UNKNOWN"]);
  const [holderTypes, setHolderTypes] = useState<HolderType[]>(["ORGANIZATION", "ORGANIZATION"]);
  const catalog = [...new Set(c.snapshot.holders.map(h => h.evidence_ref).filter((v): v is string => !!v))];
  const [evidence, setEvidence] = useState(["", ""]);
  const [price, setPrice] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const resultPanel = useRef<HTMLElement>(null);
  const isViewer = role === "viewer";

  const replace = <T,>(values: T[], index: number, value: T) => values.map((v, i) => i === index ? value : v);

  function presetBlockSale() {
    setType("TRANSFER");
    setSeller(holders.find(h => h.holder_ref === "TRANSFER-SELLER")?.holder_ref || holders[0]?.holder_ref || "");
    setRefs(["DEMO-NEW-A", "DEMO-NEW-B"]);
    setAmounts(["25000000", "25000000"]);
    setEligibilities(["ELIGIBLE", "ELIGIBLE"]);
    setHolderTypes(["ORGANIZATION", "ORGANIZATION"]);
    const source = c.snapshot.holders.find(h => h.eligibility === "ELIGIBLE" && h.evidence_ref)?.evidence_ref || catalog[0] || "";
    setEvidence([source, source]);
    setPrice("750.00");
    setErrors({}); setError(null); setResult(null);
  }

  function presetRightsIssue() {
    setType("NEW_ISSUANCE");
    setRefs(["DEMO-NEW-A", "DEMO-NEW-B"]);
    setAmounts(["29411765", "29411765"]);
    setEligibilities(["ELIGIBLE", "ELIGIBLE"]);
    setHolderTypes(["ORGANIZATION", "ORGANIZATION"]);
    const source = c.snapshot.holders.find(h => h.eligibility === "ELIGIBLE" && h.evidence_ref)?.evidence_ref || catalog[0] || "";
    setEvidence([source, source]);
    setPrice("500.00");
    setErrors({}); setError(null); setResult(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !locked || isViewer) return;
    setError(null); setResult(null);
    const next: Record<string, string> = {};
    const shares = amounts.map(sharesInput);
    shares.forEach((value, i) => { if (value === null) next[`shares-${i}`] = "Masukkan bilangan bulat positif yang aman, tanpa titik atau koma."; });
    if (shares.every(v => v !== null) && shares.reduce<bigint>((sum, v) => sum + BigInt(v!), 0n) > BigInt(Number.MAX_SAFE_INTEGER)) {
      next["shares-1"] = "Total alokasi melebihi batas integer aman.";
    }
    if (refs[0] === refs[1]) next["recipient-1"] = "Pilih dua penerima yang berbeda.";
    if (type === "TRANSFER") {
      if (!holders.some(h => h.holder_ref === seller)) next.seller = "Pilih pemegang penjual.";
      refs.forEach((ref, i) => { if (ref === seller) next[`recipient-${i}`] = "Penerima tidak boleh sama dengan penjual."; });
    }
    evidence.forEach((ref, i) => { if (!catalog.includes(ref)) next[`evidence-${i}`] = "Pilih referensi bukti dari ledger baseline."; });
    if (!priceValid(price)) next.price = "Gunakan harga positif, titik desimal, dan maksimal 2 digit pecahan.";
    setErrors(next);
    if (Object.keys(next).length) { document.getElementById(Object.keys(next)[0])?.focus(); return; }

    const action: ScenarioAction = {
      action_type: type,
      ...(type === "TRANSFER" ? { seller_ref: seller } : {}),
      allocations: refs.map((ref, i) => ({
        holder_ref: ref,
        shares: shares[i]!,
        eligibility: eligibilities[i],
        holder_type: holderTypes[i],
        evidence_ref: evidence[i],
      })),
      ...(price ? { price_idr_per_share: price } : {}),
    };

    setBusy(true);
    try {
      const data = await simulate(c.snapshot.id, action);
      setResult(data);
      requestAnimationFrame(() => resultPanel.current?.focus());
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const fieldError = (id: string) => errors[id] ? <span id={`${id}-error`} className="field-error">{errors[id]}</span> : null;

  if (!locked) {
    return (
      <Panel title="Snapshot belum terkunci">
        <p>Simpan tinjauan dan minta reviewer mengunci ledger sebelum membuat skenario. Skenario hanya menggunakan baseline yang tidak dapat diubah.</p>
        <Link className="button" href={hrefs(c).verify}>Lanjutkan tinjauan ledger</Link>
      </Panel>
    );
  }

  return (
    <>
      <div className="scenario-layout">
        <form className="panel" noValidate onSubmit={submit} onChange={() => { setResult(null); setError(null); }}>
          <div className="section-heading">
            <h2>Parameter skenario</h2>
            <div className="actions" style={{ gap: "6px" }}>
              <button
                type="button"
                className="text-button"
                onClick={() => (type === "TRANSFER" ? presetBlockSale() : presetRightsIssue())}
                disabled={busy || isViewer}
              >
                Isi contoh alokasi
              </button>
              <button type="button" className="text-button" onClick={presetBlockSale} disabled={busy || isViewer}>
                Block Sale (2×25M)
              </button>
              <button type="button" className="text-button" onClick={presetRightsIssue} disabled={busy || isViewer}>
                Rights Issue (2×29.4M)
              </button>
            </div>
          </div>

          {isViewer && (
            <div className="notice subtle" style={{ borderLeft: "4px solid #475569", marginBottom: "16px" }}>
              <strong>Mode Pemirsa (Read-Only)</strong>
              <p>Pembuatan skenario simulasi mutasi hanya dapat dilakukan oleh peran Analis atau Reviewer.</p>
            </div>
          )}

          <fieldset disabled={busy || isViewer}>
            <legend className="sr-only">Input alokasi</legend>
            <div className="field">
              <label htmlFor="operation">Jenis aksi</label>
              <select id="operation" value={type} onChange={e => { setType(e.target.value as ScenarioAction["action_type"]); setErrors({}); }}>
                <option value="TRANSFER">Transfer Saham / Block Sale</option>
                <option value="NEW_ISSUANCE">NEW_ISSUANCE · Penerbitan Baru</option>
              </select>
            </div>

            {type === "TRANSFER" && (
              <div className="field">
                <label htmlFor="seller">Pemegang penjual</label>
                <select id="seller" value={seller} onChange={e => setSeller(e.target.value)} aria-invalid={!!errors.seller}>
                  {holders.map(h => (
                    <option key={h.holder_ref} value={h.holder_ref}>
                      {holderLabel(h.holder_ref)} · {integer(h.shares)} lembar
                    </option>
                  ))}
                </select>
                {fieldError("seller")}
              </div>
            )}

            {[0, 1].map(i => {
              const letter = i === 0 ? "A" : "B";
              return (
                <fieldset className="recipient" key={i}>
                  <legend>Penerima {letter}</legend>
                  <div className="field">
                    <label htmlFor={`recipient-${i}`}>Identitas penerima {letter}</label>
                    <select id={`recipient-${i}`} value={refs[i]} onChange={e => setRefs(replace(refs, i, e.target.value))} aria-invalid={!!errors[`recipient-${i}`]}>
                      {["DEMO-NEW-A", "DEMO-NEW-B"].map(ref => <option key={ref} value={ref}>{holderLabel(ref)}</option>)}
                      {holders.map(h => <option key={h.holder_ref} value={h.holder_ref}>{holderLabel(h.holder_ref)}</option>)}
                    </select>
                    {fieldError(`recipient-${i}`)}
                  </div>
                  <div className="field">
                    <label htmlFor={`shares-${i}`}>Alokasi saham {letter}</label>
                    <input id={`shares-${i}`} inputMode="numeric" value={amounts[i]} onChange={e => setAmounts(replace(amounts, i, e.target.value))} aria-invalid={!!errors[`shares-${i}`]} />
                    {fieldError(`shares-${i}`)}
                  </div>
                  <div className="field">
                    <label htmlFor={`eligibility-${i}`}>Kelayakan penerima {letter}</label>
                    <select id={`eligibility-${i}`} value={eligibilities[i]} onChange={e => setEligibilities(replace(eligibilities, i, e.target.value as Eligibility))}>
                      {(["ELIGIBLE", "INELIGIBLE", "UNKNOWN"] as const).map(v => <option key={v} value={v}>{eligibilityLabel(v)}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={`evidence-${i}`}>Referensi bukti penerima {letter}</label>
                    <select id={`evidence-${i}`} value={evidence[i]} onChange={e => setEvidence(replace(evidence, i, e.target.value))} aria-invalid={!!errors[`evidence-${i}`]}>
                      <option value="">(Pilih referensi bukti)</option>
                      {catalog.map(source => <option key={source} value={source}>{source}</option>)}
                    </select>
                    {fieldError(`evidence-${i}`)}
                  </div>
                </fieldset>
              );
            })}

            <div className="field">
              <label htmlFor="price">Estimasi harga transaksi per saham (IDR, opsional)</label>
              <input id="price" value={price} onChange={e => setPrice(e.target.value)} placeholder="misal: 750.00" aria-invalid={!!errors.price} />
              {fieldError("price")}
            </div>

            <button className="button" type="submit" disabled={busy || isViewer}>
              {busy ? "Menghitung…" : "Hitung dan simpan skenario"}
            </button>
          </fieldset>
        </form>

        <section ref={resultPanel as any} tabIndex={-1} aria-label="Hasil skenario">
          {!!error && <ErrorBox error={error} />}
          {result ? (
            <ResultDetails result={result} company={c} />
          ) : (
            <Panel title="Hasil simulasi">
              <p className="muted">Isi alokasi atau gunakan preset, lalu klik simulasi untuk melihat dampaknya terhadap rasio free float.</p>
            </Panel>
          )}
        </section>
      </div>
    </>
  );
}

function ResultDetails({ result: r, company: c }: { result: SimulationResult; company?: Company }) {
  return (
    <Panel title="Hasil skenario tersimpan">
      <dl className="detail-list">
        <div><dt>Posisi numerik</dt><dd>{numericLabel(r.assessment.numeric_target_status)}</dd></div>
        <div><dt>Rasio free float baru</dt><dd><strong>{percent(r.assessment.free_float_ratio)}</strong></dd></div>
        <div><dt>Estimasi kas</dt><dd>{r.cash_estimate_idr == null ? "Tidak dihitung" : `IDR ${decimalText(r.cash_estimate_idr)}`}</dd></div>
      </dl>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Perubahan kepemilikan">
        <table>
          <caption>Perubahan kepemilikan per pemegang</caption>
          <thead>
            <tr>
              <th scope="col">Pemegang</th>
              <th scope="col">Sebelum</th>
              <th scope="col">Sesudah</th>
              <th scope="col">Perubahan</th>
            </tr>
          </thead>
          <tbody>
            {r.dilution_by_holder.map(d => (
              <tr key={d.holder_ref}>
                <th scope="row">{holderLabel(d.holder_ref)}</th>
                <td>{percent(d.old_ratio)}</td>
                <td>{percent(d.new_ratio)}</td>
                <td>{decimalText(d.percentage_point_change)} pp</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {c && (
        <div className="actions" style={{ marginTop: "16px" }}>
          <Link className="button" href={hrefs(c).compare}>Pilih skenario untuk perbandingan</Link>
        </div>
      )}
      <details className="provenance">
        <summary>Jejak perhitungan</summary>
        <dl className="detail-list">
          <div><dt>ID skenario</dt><dd className="mono">{r.scenario_id}</dd></div>
          <div><dt>Engine</dt><dd>{r.engine_version}</dd></div>
          <div><dt>Hash input</dt><dd className="mono">{r.input_hash}</dd></div>
          <div><dt>Hash hasil</dt><dd className="mono">{r.result_hash}</dd></div>
        </dl>
      </details>
    </Panel>
  );
}

function Compare({ company: c }: { company: Company }) {
  const router = useRouter();
  const [results, setResults] = useState<SimulationResult[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [baseline, setBaseline] = useState<SnapshotRecord | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setResults(null); setSelected([]); setComparison(null); setBaseline(null); setError(null);
    getScenarios(c.id, controller.signal)
      .then(data => { if (!controller.signal.aborted) setResults(data); })
      .catch(e => { if (!controller.signal.aborted) setError(e); });
    return () => controller.abort();
  }, [c.id, attempt]);

  function choose(r: SimulationResult) {
    setSelected(ids => ids.includes(r.scenario_id) ? ids.filter(id => id !== r.scenario_id) : [...ids, r.scenario_id]);
    setComparison(null); setBaseline(null); setError(null);
  }

  async function compare() {
    if (selected.length !== 2 || busy) return;
    setBusy(true); setError(null); setComparison(null); setBaseline(null);
    try {
      const value = await compareScenarios(selected);
      const version = await getSnapshot(value.snapshot_id);
      if (version.company_id !== c.id || version.status !== "LOCKED") {
        throw new ApiError("Baseline perbandingan bukan versi terkunci perusahaan ini.");
      }
      setBaseline(version); setComparison(value);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function report() {
    if (!comparison || busy) return;
    setBusy(true); setError(null);
    try {
      const result = await generateReport(comparison.scenarios.map(r => r.scenario_id));
      router.push(`/reports/${encodeURIComponent(result.id)}?company=${encodeURIComponent(c.id)}`);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  const selectedSnapshot = results?.find(r => r.scenario_id === selected[0])?.snapshot_id;

  return (
    <>
      {!!error && <ErrorBox error={error} retry={() => setAttempt(a => a + 1)} />}
      {!results && !error ? (
        <Loading>Memuat skenario tersimpan…</Loading>
      ) : results?.length === 0 ? (
        <Panel title="Belum ada skenario tersimpan">
          <p>Buat dua skenario pada snapshot terkunci yang sama untuk membandingkan dampaknya.</p>
          <Link className="button" href={hrefs(c).scenario}>Buat skenario pertama</Link>
        </Panel>
      ) : results && (
        <>
          <Panel title="Skenario tersimpan">
            <p className="muted">Pilih tepat dua skenario. Pilihan dari baseline berbeda dinonaktifkan agar perbandingan setara.</p>
            <div className="scenario-list">
              {results.map((r, i) => {
                const checked = selected.includes(r.scenario_id);
                const disabled = busy || (!checked && (selected.length >= 2 || (!!selectedSnapshot && selectedSnapshot !== r.snapshot_id)));
                return (
                  <label className={`scenario-choice${disabled ? " is-disabled" : ""}`} key={r.scenario_id}>
                    <input type="checkbox" checked={checked} disabled={disabled} onChange={() => choose(r)} />
                    <span>
                      <strong>{r.action.action_type === "TRANSFER" ? "Transfer saham" : "Penerbitan baru"} · {r.created_at ? new Date(r.created_at).toLocaleString("id-ID") : `Skenario ${i + 1}`}</strong>
                      <small>Baseline {r.snapshot_id.slice(0, 8)} · {r.action.allocations.map(a => `${holderLabel(a.holder_ref)}: ${integer(a.shares)} lembar`).join("; ")}</small>
                      <small className="mono">ID {r.scenario_id}</small>
                    </span>
                    <span className="scenario-ratio">
                      {percent(r.assessment.free_float_ratio)}
                      <small>{numericLabel(r.assessment.numeric_target_status)}</small>
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="actions">
              <button className="button" onClick={compare} disabled={selected.length !== 2 || busy}>
                {busy ? "Memproses…" : "Bandingkan pilihan"}
              </button>
              <Link className="button secondary" href={hrefs(c).scenario}>Tambah skenario</Link>
              <span className="muted small">{selected.length} dari 2 dipilih</span>
            </div>
          </Panel>

          {comparison && baseline && (
            <>
              <ComparisonTable comparison={comparison} company={c} baseline={baseline} />
              <div className="actions">
                <button className="button" onClick={report} disabled={busy}>Buat laporan tersimpan</button>
                <Link className="button secondary" href={hrefs(c).reports}>Arsip laporan</Link>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

function ComparisonTable({ comparison, company, baseline }: { comparison: Comparison; company: Company; baseline: SnapshotRecord }) {
  const assessment = company.snapshot.id === baseline.id ? company.assessment : undefined;
  const assessments = [assessment, ...comparison.scenarios.map(r => r.assessment)];
  return (
    <div className="table-scroll comparison" tabIndex={0} role="region" aria-label="Perbandingan baseline dan skenario">
      <table>
        <caption>Perbandingan pada baseline {baseline.snapshot.as_of_date} · {baseline.id.slice(0, 8)}</caption>
        <thead>
          <tr>
            <th scope="col">Metrik</th>
            <th scope="col">Baseline<small>Versi terkunci</small></th>
            {comparison.scenarios.map((r, i) => (
              <th scope="col" key={r.scenario_id}>Skenario {i === 0 ? "A" : "B"}<small>{r.action.action_type === "TRANSFER" ? "Transfer saham" : "Penerbitan baru"}</small></th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Total saham</th>
            <td>{integer(baseline.snapshot.total_shares)}</td>
            {comparison.scenarios.map(r => <td key={r.scenario_id}>{integer(r.assessment.total_shares)}</td>)}
          </tr>
          <tr>
            <th scope="row">Saham eligible</th>
            {assessments.map((a, i) => <td key={i}>{a ? integer(a.eligible_shares) : "Asesmen baseline belum tersedia"}</td>)}
          </tr>
          <tr className="ratio-row">
            <th scope="row">Rasio free float</th>
            {assessments.map((a, i) => <td key={i}>{a ? percent(a.free_float_ratio) : "Belum tersedia"}</td>)}
          </tr>
          <tr>
            <th scope="row">Target numerik</th>
            {assessments.map((a, i) => <td key={i}>{a ? percent(a.target_ratio) : "Belum tersedia"}</td>)}
          </tr>
          <tr>
            <th scope="row">Posisi numerik</th>
            {assessments.map((a, i) => <td key={i}>{a ? numericLabel(a.numeric_target_status) : "Belum tersedia"}</td>)}
          </tr>
          <tr>
            <th scope="row">Estimasi kas · IDR</th>
            <td>—</td>
            {comparison.scenarios.map(r => <td key={r.scenario_id}>{r.cash_estimate_idr == null ? "Harga tidak diisi" : decimalText(r.cash_estimate_idr)}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Reports({ company: c }: { company: Company }) {
  const [reports, setReports] = useState<ReportResult[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setReports(null); setError(null);
    getReports(c.id, controller.signal)
      .then(data => { if (!controller.signal.aborted) setReports(data); })
      .catch(e => { if (!controller.signal.aborted) setError(e); });
    return () => controller.abort();
  }, [c.id, attempt]);

  return error ? <ErrorBox error={error} retry={() => setAttempt(a => a + 1)} /> : !reports ? <Loading /> : (
    <Panel title="Laporan & Memo Tersimpan">
      {reports.length === 0 ? (
        <>
          <p>Belum ada laporan tersimpan. Pilih dua skenario, bandingkan, lalu buat laporan.</p>
          <Link className="button" href={hrefs(c).compare}>Pilih skenario</Link>
        </>
      ) : (
        <ul className="report-list">
          {reports.map((r, i) => (
            <li key={r.id}>
              <div>
                <strong>Memo Analisis Free Float #{reports.length - i}</strong>
                <small>{r.created_at ? new Date(r.created_at).toLocaleString("id-ID") : r.id}</small>
              </div>
              <Link className="button secondary" href={`/reports/${encodeURIComponent(r.id)}?company=${encodeURIComponent(c.id)}`}>
                Buka memo
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Report({ resource, company }: { resource?: string; company: Company | null }) {
  const [report, setReport] = useState<ReportResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [downloadError, setDownloadError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setReport(null); setError(null);
    if (!resource || resource === "new") {
      setError(new ApiError("Laporan harus dibuat dari pilihan skenario tersimpan. Buka perbandingan untuk membuat laporan."));
      return;
    }
    getReport(resource, controller.signal)
      .then(data => { if (!controller.signal.aborted) setReport(data); })
      .catch(e => { if (!controller.signal.aborted) setError(e); });
    return () => controller.abort();
  }, [resource, attempt]);

  function download() {
    if (!report) return;
    try {
      const url = URL.createObjectURL(new Blob([report.markdown_content], { type: "text/markdown;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `FloatPath-Memo-${report.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40)}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setDownloadError(true);
    }
  }

  function printView() {
    if (typeof window !== "undefined") {
      window.print();
    }
  }

  return (
    <>
      {error ? (
        <ErrorBox error={error} retry={() => setAttempt(a => a + 1)} />
      ) : !report ? (
        <Loading>Memuat memo analisis tersimpan…</Loading>
      ) : (
        <>
          <div className="section-heading">
            <div>
              <h2>Dokumen Memo Eksekutif</h2>
              <p className="muted small">ID Dokumen: <span className="mono">{report.id}</span></p>
            </div>
            <div className="actions" style={{ gap: "8px" }}>
              <button className="button secondary" onClick={printView}>Cetak / Print PDF</button>
              <button className="button" onClick={download}>Unduh Markdown</button>
            </div>
          </div>
          {downloadError && <p className="field-error" role="alert">Unduhan tidak dapat dibuat. Salin teks dari pratinjau laporan.</p>}
          <div className="report-document">
            <div className="report-watermark">DATA SINTETIS · KAJIAN SIMULASI · BUKAN DOKUMEN RESMI</div>
            <pre className="memo" tabIndex={0} aria-label="Isi memo analisis">{report.markdown_content}</pre>
          </div>
          <Limits />
          <details className="provenance">
            <summary>Referensi sumber dan integritas hash</summary>
            {report.sources.length ? (
              <ul className="source-list">
                {report.sources.map((source, i) => (
                  <li key={i} className="mono">{typeof source === "string" ? source : JSON.stringify(source)}</li>
                ))}
              </ul>
            ) : (
              <p>Referensi sumber belum tersedia.</p>
            )}
            <p className="muted small">Referensi sintetis bukan bukti pemegang saham nyata.</p>
          </details>
        </>
      )}
      {company && (
        <div className="actions">
          <Link href={hrefs(company).reports} className="button secondary">Arsip laporan</Link>
          <Link href={hrefs(company).compare} className="text-link">Kembali ke perbandingan</Link>
        </div>
      )}
    </>
  );
}

function AuditTrailView({ session: _session }: { session: Session }) {
  const [events, setEvents] = useState<AuditEventRecord[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setEvents(null); setError(null);
    getAuditEvents(controller.signal)
      .then(data => { if (!controller.signal.aborted) setEvents(data); })
      .catch(e => { if (!controller.signal.aborted) setError(e); });
    return () => controller.abort();
  }, [attempt]);

  if (error) return <ErrorBox error={error} retry={() => setAttempt(a => a + 1)} />;
  if (!events) return <Loading>Memuat jejak audit tata kelola…</Loading>;

  const filtered = events.filter(ev => {
    if (filter !== "ALL" && ev.action !== filter) return false;
    if (search && !JSON.stringify(ev).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const actions = ["ALL", ...new Set(events.map(e => e.action))];

  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Rekaman Jejak Audit (Audit Trail)</h2>
          <p className="muted small">Seluruh mutasi tercatat imutabel bersama hash integritas SHA-256 dan correlation ID.</p>
        </div>
        <div className="actions" style={{ gap: "8px" }}>
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{ width: "auto" }}>
            {actions.map(act => <option key={act} value={act}>{act === "ALL" ? "Semua Aksi" : act}</option>)}
          </select>
          <input
            placeholder="Cari aktor / hash / ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: "220px" }}
          />
        </div>
      </div>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabel Jejak Audit">
        <table>
          <thead>
            <tr>
              <th scope="col">Waktu (WIB/Lokal)</th>
              <th scope="col">Aktor & Peran</th>
              <th scope="col">Aksi</th>
              <th scope="col">ID Entitas</th>
              <th scope="col">Hash Kriptografis (Sebelum / Sesudah)</th>
              <th scope="col">Correlation ID</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: "20px" }}>Tidak ada peristiwa yang cocok.</td></tr>
            ) : (
              filtered.map(ev => (
                <tr key={ev.id}>
                  <td className="small muted">{ev.created_at ? new Date(ev.created_at).toLocaleString("id-ID") : "—"}</td>
                  <td>
                    <strong>@{ev.username || (ev.actor_id.startsWith("bearer:") ? ev.actor_id : ev.actor_id.slice(0, 8))}</strong>
                    {ev.actor_role && (
                      <span className={`role-badge ${ev.actor_role}`} style={{ marginLeft: "6px" }}>
                        {ev.actor_role}
                      </span>
                    )}
                  </td>
                  <td><span className="mono" style={{ fontWeight: 600 }}>{ev.action}</span></td>
                  <td><small className="mono">{ev.entity_id}</small></td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      {ev.before_hash && <small className="mono" title={`Sebelum: ${ev.before_hash}`}>Seb: {ev.before_hash.slice(0, 16)}…</small>}
                      {ev.after_hash && <small className="mono" title={`Sesudah: ${ev.after_hash}`}>Ses: {ev.after_hash.slice(0, 16)}…</small>}
                      {!ev.before_hash && !ev.after_hash && <span className="muted small">—</span>}
                    </div>
                  </td>
                  <td><small className="mono muted">{ev.correlation_id}</small></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TeamManagementView({ session }: { session: Session }) {
  const [users, setUsers] = useState<WorkspaceUser[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("analyst");
  const [formMessage, setFormMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setUsers(null); setError(null);
    getWorkspaceUsers(controller.signal)
      .then(data => { if (!controller.signal.aborted) setUsers(data); })
      .catch(e => { if (!controller.signal.aborted) setError(e); });
    return () => controller.abort();
  }, [attempt]);

  async function handleAddUser(e: FormEvent) {
    e.preventDefault();
    if (!newUsername.trim() || newPassword.length < 12 || busy) return;
    setBusy(true); setError(null); setFormMessage("");
    try {
      await createWorkspaceUser({ username: newUsername.trim(), password: newPassword, role: newRole });
      setNewUsername("");
      setNewPassword("");
      setFormMessage(`Pengguna @${newUsername.trim()} berhasil ditambahkan sebagai ${roleLabel(newRole)}.`);
      setAttempt(a => a + 1);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleRoleChange(userId: string, targetRole: UserRole) {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      await updateWorkspaceUserRole(userId, targetRole);
      setAttempt(a => a + 1);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (session.user.role !== "admin") {
    return (
      <Panel title="Akses Ditolak">
        <p>Halaman manajemen tim hanya dapat diakses oleh Administrator Workspace.</p>
      </Panel>
    );
  }

  return (
    <>
      {!!error && <ErrorBox error={error} retry={() => setAttempt(a => a + 1)} />}
      {formMessage && <p className="success-message" role="status">{formMessage}</p>}

      <div className="two-columns">
        <Panel title="Daftar Pengguna Workspace">
          {!users ? <Loading>Memuat daftar pengguna…</Loading> : (
            <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabel Pengguna">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Pengguna</th>
                    <th scope="col">Peran Aktif</th>
                    <th scope="col">Terdaftar</th>
                    <th scope="col">Ubah Peran</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <th scope="row">
                        <strong>@{u.username}</strong>
                        {u.id === session.user.id && <small className="muted" style={{ display: "block" }}>(Akun Anda)</small>}
                      </th>
                      <td>
                        <span className={`role-badge ${u.role}`}>{roleLabel(u.role)}</span>
                      </td>
                      <td className="small muted">{u.created_at ? new Date(u.created_at).toLocaleDateString("id-ID") : "—"}</td>
                      <td>
                        <select
                          value={u.role}
                          disabled={busy || u.id === session.user.id}
                          onChange={e => handleRoleChange(u.id, e.target.value as UserRole)}
                          style={{ padding: "4px 8px", fontSize: "0.8rem", width: "auto" }}
                        >
                          <option value="admin">Admin</option>
                          <option value="reviewer">Reviewer</option>
                          <option value="analyst">Analis</option>
                          <option value="viewer">Auditor</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Tambah Pengguna Baru">
          <form onSubmit={handleAddUser}>
            <div className="field">
              <label htmlFor="user-name">Nama Pengguna (Username)</label>
              <input
                id="user-name"
                required
                maxLength={64}
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                placeholder="misal: corsec_lead"
              />
            </div>
            <div className="field">
              <label htmlFor="user-role">Peran & Wewenang</label>
              <select id="user-role" value={newRole} onChange={e => setNewRole(e.target.value as UserRole)}>
                <option value="analyst">Analis Kepemilikan (BAE) — Input, CSV, Skenario</option>
                <option value="reviewer">Reviewer (Corsec) — Kunci Snapshot, Memo</option>
                <option value="admin">Admin Workspace — Akses Penuh & Kelola Tim</option>
                <option value="viewer">Auditor / Pemirsa — Hanya-Baca & Jejak Audit</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="user-password">Kata Sandi (Minimal 12 Karakter)</label>
              <input
                id="user-password"
                type="password"
                required
                minLength={12}
                maxLength={256}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Minimal 12 karakter aman"
              />
            </div>
            <button className="button" type="submit" disabled={busy || !newUsername.trim() || newPassword.length < 12}>
              {busy ? "Menyimpan…" : "Daftarkan Pengguna"}
            </button>
          </form>
        </Panel>
      </div>

      <Panel title="Matriks Otorisasi Peran (RBAC Capability Matrix)" style={{ marginTop: "24px" }}>
        <p className="muted small" style={{ marginBottom: "16px" }}>
          Penegakan otorisasi FloatPath Intelligence dilakukan langsung di server API dan database imutabel:
        </p>
        <div className="table-scroll">
          <table className="rbac-table">
            <thead>
              <tr>
                <th scope="col">Kapabilitas Fitur</th>
                <th scope="col">Auditor (Viewer)</th>
                <th scope="col">Analis (BAE)</th>
                <th scope="col">Reviewer (Corsec)</th>
                <th scope="col">Admin Workspace</th>
              </tr>
            </thead>
            <tbody>
              <tr><th scope="row">Tinjau Ledger & Portofolio</th><td>✅ Baca</td><td>✅ Baca</td><td>✅ Baca</td><td>✅ Baca</td></tr>
              <tr><th scope="row">Entri Manual & Impor CSV Ledger</th><td>❌ Ditolak</td><td>✅ Tulis</td><td>✅ Tulis</td><td>✅ Tulis</td></tr>
              <tr><th scope="row">Validasi Rekonsiliasi Saham</th><td>❌ Ditolak</td><td>✅ Eksekusi</td><td>✅ Eksekusi</td><td>✅ Eksekusi</td></tr>
              <tr><th scope="row">Kunci Snapshot Imutabel (SHA-256)</th><td>❌ Ditolak</td><td>❌ Ditolak (403)</td><td>✅ Kunci Resmi</td><td>✅ Kunci Resmi</td></tr>
              <tr><th scope="row">Simulasi Skenario Transfer / Terbit</th><td>❌ Ditolak</td><td>✅ Simulasi</td><td>✅ Simulasi</td><td>✅ Simulasi</td></tr>
              <tr><th scope="row">Penyusunan & Unduh Memo Eksekutif</th><td>✅ Baca/Unduh</td><td>✅ Buat Draft</td><td>✅ Memo Resmi</td><td>✅ Memo Resmi</td></tr>
              <tr><th scope="row">Akses Jejak Audit (Audit Trail)</th><td>✅ Baca Lengkap</td><td>❌ Ditolak</td><td>✅ Baca Lengkap</td><td>✅ Baca Lengkap</td></tr>
              <tr><th scope="row">Manajemen Anggota Tim & Peran</th><td>❌ Ditolak</td><td>❌ Ditolak</td><td>❌ Ditolak</td><td>✅ Hak Penuh</td></tr>
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
