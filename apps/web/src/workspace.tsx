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
  evidenceLabel,
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
import {
  CheckIcon,
  XIcon,
  LockIcon,
  ShieldIcon,
  BuildingIcon,
  FileTextIcon,
  UsersIcon,
  UserIcon,
  AlertTriangleIcon,
  InfoIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  ChevronRightIcon,
  RefreshIcon,
  UploadIcon,
  DownloadIcon,
  CopyIcon,
  SearchIcon,
  SlidersIcon,
  EyeIcon,
  LogOutIcon,
} from "./icons";
import { Modal } from "./components/Modal";
import { Drawer } from "./components/Drawer";
import { useToast } from "./components/Toast";
import { canAccessScreen, canWrite, canLock, type Screen } from "./access";

const screenNames: Record<Screen, string> = {
  workspace: "Company portfolio",
  company: "Company overview",
  verify: "Review shareholdings",
  assessment: "Free-float assessment",
  scenario: "Create analysis",
  compare: "Compare analyses",
  reports: "Report archive",
  report: "Analysis report",
  audit: "Audit trail & governance",
  team: "Team management & authorization",
};

const descriptions: Record<Screen, string> = {
  workspace: "Monitor shareholdings and continue work on each company.",
  company: "Current shareholdings, data readiness, and company analysis activity.",
  verify: "Review the ledger, save your review, then set the data version for analysis.",
  assessment: "Free-float position against the numeric target and items still requiring verification.",
  scenario: "Build allocations to assess their impact on shareholdings and free float.",
  compare: "Select two saved analyses with the same baseline version.",
  reports: "Saved reports and analysis references that can be reopened.",
  report: "Saved analysis document with sources and a calculation trace.",
  audit: "History of data changes, statuses, and request identifiers recorded in the database.",
  team: "Workspace user settings, role-based access control (RBAC), and capability matrix.",
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
      <strong>Request unsuccessful {error instanceof ApiError && error.status ? `(${error.status})` : ""}</strong>
      <p>{error instanceof Error ? error.message : "An unknown error occurred."}</p>
      {error instanceof ApiError && error.correlationId && (
        <small className="mono">Request ID: {error.correlationId}</small>
      )}
      {retry && <button className="button secondary" onClick={retry}>Try again</button>}
    </div>
  );
}

function Loading({ children = "Loading workspace…" }: { children?: ReactNode }) {
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
      <Metric label="Total shares" value={integer(a.total_shares)} note="Shares" />
      <Metric label="Eligible shares" value={integer(a.eligible_shares)} note="Based on ledger classification" />
      <Metric label="Free-float ratio" value={percent(a.free_float_ratio)} note={numericLabel(a.numeric_target_status)} />
      <Metric label="Numeric target" value={percent(a.target_ratio)} note="Unverified analysis profile" />
    </div>
  );
}

function Limits({ assessment }: { assessment?: Assessment }) {
  return (
    <aside className="notice">
      <strong>Assessment limits</strong>
      <p>Data and evidence in this workspace are synthetic. Results show numeric positions, not legal compliance assessments, investment recommendations, or official documents. Shareholder eligibility and real-world rule applicability have not been verified.</p>
      {assessment && (assessment.warnings.length > 0 || assessment.unresolved_constraints.length > 0) && (
        <details>
          <summary>Action items</summary>
          <ul>{[...assessment.warnings, ...assessment.unresolved_constraints].map((item, i) => <li key={i}>{item}</li>)}</ul>
        </details>
      )}
    </aside>
  );
}

function Provenance({ company: c }: { company: Company }) {
  return (
    <details className="provenance">
      <summary>Source & data version details</summary>
      <dl className="detail-list">
        <div><dt>Snapshot</dt><dd>{c.snapshot.as_of_date}</dd></div>
        <div><dt>Source</dt><dd>Synthetic dataset, not real market data or shareholder identities</dd></div>
        <div><dt>Snapshot ID</dt><dd className="mono">{c.snapshot.id}</dd></div>
        {c.assessment && (
          <>
            <div><dt>Data hash</dt><dd className="mono">{c.assessment.data_hash}</dd></div>
            <div><dt>Profile / version</dt><dd>{c.assessment.rule_set_id} / {c.assessment.rule_version}</dd></div>
            <div><dt>Internal status</dt><dd>{c.assessment.assessment_status} · {c.assessment.rule_status}</dd></div>
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
      if (!canAccessScreen(auth.user.role, screen)) return;
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
      if (!id) throw new ApiError("Select a company from the portfolio to continue.");
      const data = await getCompany(id, controller.signal);
      version = version || await getSnapshot(data.snapshot.id, controller.signal);
      if (version.company_id !== data.id) throw new ApiError("The ledger version does not match the selected company.");
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
        {error ? <ErrorBox error={error} retry={() => setAttempt(a => a + 1)} /> : <Loading>Checking session…</Loading>}
      </main>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <aside className="sidebar">
        <Link href="/workspace" className="brand" aria-label="FloatPath, portfolio">
          <span className="brand-mark" aria-hidden="true">fp</span>
          <span>FloatPath<small>INTELLIGENCE</small></span>
        </Link>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          <Link href="/workspace" aria-current={screen === "workspace" ? "page" : undefined}>
            <BuildingIcon size={16} /> Company portfolio
          </Link>
          {([ "company", "verify", "assessment", "scenario", "compare", "reports" ] as const).filter(s => canAccessScreen(session.user.role, s)).map(s => {
            const iconMap = {
              company: <InfoIcon size={16} />,
              verify: <FileTextIcon size={16} />,
              assessment: <ShieldIcon size={16} />,
              scenario: <SlidersIcon size={16} />,
              compare: <CopyIcon size={16} />,
              reports: <FileTextIcon size={16} />,
            };
            return links ? (
              <Link key={s} href={links[s]} aria-current={screen === s || (s === "reports" && screen === "report") ? "page" : undefined}>
                {iconMap[s]} {s === "verify" && !canWrite(session.user.role) ? "View shareholdings" : screenNames[s]}
              </Link>
            ) : (
              <span className="nav-disabled" key={s}>{iconMap[s]} {s === "verify" && !canWrite(session.user.role) ? "View shareholdings" : screenNames[s]}</span>
            );
          })}

          {canAccessScreen(session.user.role, "audit") && <p className="nav-label" style={{ marginTop: "16px" }}>GOVERNANCE</p>}
          {canAccessScreen(session.user.role, "audit") && (
            <Link href="/audit" aria-current={screen === "audit" ? "page" : undefined}>
              <ShieldIcon size={16} /> Audit trail & governance
            </Link>
          )}
          {canAccessScreen(session.user.role, "team") && (
            <Link href="/team" aria-current={screen === "team" ? "page" : undefined}>
              <UsersIcon size={16} /> Team management & authorization
            </Link>
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
              {screen === "workspace" ? "Company portfolio" : screenNames[screen]}
            </p>
          </div>
          <div className="account">
            <span className="data-pill">Synthetic data</span>
            <div className="account-name">
              <strong>@{session.user.username}</strong>
              <span className={`role-badge ${session.user.role}`} style={{ display: "inline-block", marginTop: "2px" }}>
                {roleLabel(session.user.role)}
              </span>
            </div>
            <button className="text-button" onClick={signOut} disabled={loggingOut}>
              {loggingOut ? "Signing out…" : "Sign out"}
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
                {snapshot?.status === "LOCKED" ? "Locked snapshot" : "Draft ledger"}
              </Badge>
            )}
          </div>

          {!!error && <ErrorBox error={error} retry={() => setAttempt(a => a + 1)} />}

          {!canAccessScreen(session.user.role, screen) ? (
            <Panel title="Access denied">
              <p>Your role does not have access to this page. Contact an administrator to change permissions.</p>
              <Link className="button secondary" href="/workspace">Back to company portfolio</Link>
            </Panel>
          ) : <>
          {screen === "workspace" && !error && !companies && <Loading>Loading company portfolio…</Loading>}
          {screen === "workspace" && companies && <Portfolio companies={companies} />}
          {screen === "company" && company && <Overview company={company} role={session.user.role} />}
          {screen === "verify" && company && snapshot && (
            <Verify key={snapshot.id} company={company} initial={snapshot} role={session.user.role} onLocked={setSnapshot} />
          )}
          {screen === "assessment" && company && <AssessmentView company={company} role={session.user.role} />}
          {screen === "scenario" && company && (
            <ScenarioForm company={company} locked={snapshot?.status === "LOCKED"} role={session.user.role} />
          )}
          {screen === "compare" && company && <Compare company={company} role={session.user.role} />}
          {screen === "reports" && company && <Reports company={company} role={session.user.role} />}
          {screen === "report" && <Report resource={resource} company={company} role={session.user.role} />}
          {screen === "audit" && <AuditTrailView session={session} />}
          {screen === "team" && <TeamManagementView session={session} />}
          </>}
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
        <Metric label="Companies" value={integer(companies.length)} note="In the workspace portfolio" />
        <Metric label="Draft ledger" value={integer(drafts)} note="Awaiting review and locking" />
        <Metric label="Needs numeric attention" value={integer(needsReview)} note="Below target or not yet assessed" />
      </div>
      <div className="section-heading">
        <h2>Company list</h2>
        <span className="muted">{companies.length} synthetic companies</span>
      </div>
      {companies.length === 0 ? (
        <Panel title="Company portfolio not available">
          <p>There are no companies in the workspace. Ask an administrator to add a synthetic dataset to start an analysis.</p>
        </Panel>
      ) : (
        <div className="company-grid">
          {companies.map(c => (
            <article key={c.id} className="company-card">
              <div className="card-top">
                <span className="company-monogram" aria-hidden="true">{companyLabel(c).slice(0, 2)}</span>
                <Badge tone={(c.snapshot_state || c.snapshot_status) === "DRAFT" ? "draft" : ""}>
                  {(c.snapshot_state || c.snapshot_status) === "DRAFT" ? "Draft" : "Locked"}
                </Badge>
              </div>
              <p className="eyebrow">{companyLabel(c)}</p>
              <h3>{c.legal_name}</h3>
              <p className="muted">As of {c.snapshot.as_of_date}</p>
              <dl className="card-stats">
                <div><dt>Free-float ratio</dt><dd>{c.assessment ? percent(c.assessment.free_float_ratio) : "Not available"}</dd></div>
                <div><dt>Total shares</dt><dd>{integer(c.snapshot.total_shares)}</dd></div>
              </dl>
              <p className="card-status">{c.assessment ? numericLabel(c.assessment.numeric_target_status) : "Assessment not available"}</p>
              <Link className="button card-link" href={hrefs(c).company}>Open company<span aria-hidden="true">↗</span></Link>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function Overview({ company: c, role }: { company: Company; role: UserRole }) {
  return (
    <>
      {!canWrite(role) && <div className="notice subtle"><strong>Read-only access</strong><p>You can view shareholdings, assessments, comparisons, and reports. Opening a company does not grant permission to change data, create analyses, or lock snapshots.</p></div>}
      {c.assessment ? <AssessmentMetrics assessment={c.assessment} /> : (
        <Panel title="Assessment not available"><p>Validate the ledger to check data readiness before analysis.</p></Panel>
      )}
      <div className="two-columns">
        <Panel title="Shareholding position">
          <dl className="detail-list">
            <div><dt>Company</dt><dd>{c.legal_name}</dd></div>
            <div><dt>Snapshot date</dt><dd>{c.snapshot.as_of_date}</dd></div>
            <div><dt>Holders in ledger</dt><dd>{integer(c.snapshot.holders.length)} rows</dd></div>
            <div><dt>SID count</dt><dd>{integer(c.snapshot.sid_count)}<small>Dataset input, not ledger rows.</small></dd></div>
            <div><dt>Version status</dt><dd>{c.snapshot_state === "LOCKED" ? "Locked for analysis" : "Draft, open for review"}</dd></div>
          </dl>
          <div className="actions">
            <Link className="button" href={hrefs(c).verify}>Review ledger</Link>
            <Link className="button secondary" href={hrefs(c).assessment}>View assessment</Link>
          </div>
        </Panel>
        <Panel title="Analysis activity">
          <div className="workflow-row"><span className="step-number">01</span><div><h3>Prepare the data version</h3><p>Review classifications and evidence; lock the snapshot after validation.</p></div></div>
          <div className="workflow-row"><span className="step-number">02</span><div><h3>Build alternatives</h3><p>Save transfer or issuance analyses on the locked baseline.</p></div></div>
          <div className="workflow-row"><span className="step-number">03</span><div><h3>Document results</h3><p>Compare analyses and save the review memo.</p></div></div>
          <div className="actions">
            <Link className="button secondary" href={hrefs(c).compare}>Saved analyses</Link>
            <Link className="text-link" href={hrefs(c).reports}>Report archive</Link>
          </div>
        </Panel>
      </div>
    </>
  );
}

const flagFields = [["controller", "Controller"], ["controller_affiliate", "Controller affiliate"], ["director_commissioner", "Director/commissioner"], ["treasury", "Treasury"], ["restricted", "Restricted"]] as const;
const flagValue = (value: Flag | undefined) => value === true || value === "TRUE" ? "TRUE" : value === false || value === "FALSE" ? "FALSE" : "UNKNOWN";
const eligibilityLabel = (value: Eligibility) => ({ ELIGIBLE: "Eligible", INELIGIBLE: "Ineligible", UNKNOWN: "Unknown" })[value];

function OwnershipBreakdown({ holders, totalShares }: { holders: Holder[]; totalShares: number }) {
  const sum = (selected: Holder[]) => selected.reduce((acc, h) => acc + BigInt(h.shares), 0n);
  const controllerShares = sum(holders.filter(h => flagValue(h.controller) === "TRUE"));
  const affiliateShares = sum(holders.filter(h => flagValue(h.controller_affiliate) === "TRUE" || flagValue(h.director_commissioner) === "TRUE"));
  const treasuryShares = sum(holders.filter(h => flagValue(h.treasury) === "TRUE" || flagValue(h.restricted) === "TRUE"));
  const eligibleShares = sum(holders.filter(h => h.eligibility === "ELIGIBLE"));
  const totalRecorded = sum(holders);
  const difference = totalRecorded - BigInt(totalShares);
  const reconciled = difference === 0n;
  const portion = (shares: bigint) => {
    if (totalShares <= 0) return "—";
    const scaled = shares * 10000n / BigInt(totalShares);
    return `${scaled / 100n}.${String(scaled % 100n).padStart(2, "0")}%`;
  };

  return (
    <div className="category-breakdown">
      <div className="category-card">
        <span>Controller</span>
        <strong>{integer(controllerShares)}</strong>
        <small>{portion(controllerShares)}</small>
      </div>
      <div className="category-card">
        <span>Affiliate & Director/Commissioner</span>
        <strong>{integer(affiliateShares)}</strong>
        <small>{portion(affiliateShares)}</small>
      </div>
      <div className="category-card">
        <span>Treasury & Restricted</span>
        <strong>{integer(treasuryShares)}</strong>
        <small>{portion(treasuryShares)}</small>
      </div>
      <div className="category-card" style={{ borderLeft: "3px solid var(--primary)" }}>
        <span>Classified as eligible</span>
        <strong style={{ color: "var(--primary)" }}>{integer(eligibleShares)}</strong>
        <small>{portion(eligibleShares)}</small>
      </div>
      <div className="category-card">
        <span>Reconciliation status</span>
        <strong style={{ color: reconciled ? "var(--primary)" : "var(--danger)" }}>{reconciled ? "100% Balanced" : "Has discrepancy"}</strong>
        <small>{reconciled ? "Total matches shares" : `Discrepancy of ${integer(difference < 0n ? -difference : difference)} shares`}</small>
      </div>
    </div>
  );
}

function Verify({ company: c, initial, role, onLocked }: { company: Company; initial: SnapshotRecord; role: UserRole; onLocked: (record: SnapshotRecord) => void }) {
  const router = useRouter();
  const toast = useToast();
  const [record, setRecord] = useState(initial);
  const [rows, setRows] = useState(initial.snapshot.holders);
  const [shareValues, setShareValues] = useState(initial.snapshot.holders.map(h => String(h.shares)));
  const [dirty, setDirty] = useState(false);
  const [validated, setValidated] = useState(false);
  const [validationHash, setValidationHash] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [file, setFile] = useState<File | null>(null);
  const [selectedHolder, setSelectedHolder] = useState<Holder | null>(null);
  const [lockOpen, setLockOpen] = useState(false);
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const inFlight = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  const isViewer = !canWrite(role);
  const isReviewerOrAdmin = canLock(role);
  const editable = record.status === "DRAFT" && canWrite(role);
  const evidenceRefs = [...new Set(initial.snapshot.holders.map(h => h.evidence_ref).filter((v): v is string => !!v))];

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty || busy) event.preventDefault(); };
    const navigate = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if ((dirty || busy) && link instanceof HTMLAnchorElement && link.href !== window.location.href && !link.hash && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0 && link.target !== "_blank") {
        event.preventDefault();
        event.stopPropagation();
        if (!busy) setLeaveHref(link.href);
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", navigate, true); };
  }, [dirty, busy]);

  function edit(index: number, value: Partial<Holder>) {
    setRows(items => items.map((h, i) => i === index ? { ...h, ...value } : h));
    setDirty(true); setValidated(false); setValidationHash(null); setConfirmed(false); setMessage("");
  }

  async function refresh() {
    const next = await getSnapshot(record.id);
    setRecord(next); setRows(next.snapshot.holders); setShareValues(next.snapshot.holders.map(h => String(h.shares))); setDirty(false);
    return next;
  }

  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(null); setMessage("");
    try {
      await action();
    } catch (e) {
      if (e instanceof ApiError && ["SNAPSHOT_CHANGED", "SNAPSHOT_LOCKED"].includes(e.code || "")) {
        setValidated(false); setValidationHash(null); setConfirmed(false); setLockOpen(false);
        try {
          const next = await refresh();
          onLocked(next);
          e = new ApiError("The ledger has changed since your review. Review the latest data before locking.", e.correlationId, e.status, e.code);
        } catch (reloadError) {
          e = reloadError;
        }
      }
      setError(e);
      toast.error("Operation failed", e instanceof Error ? e.message : "A server error occurred");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function save() {
    await run(async () => {
      const holders = rows.map((h, i) => {
        const shares = /^0+$/.test(shareValues[i]) ? 0 : sharesInput(shareValues[i]);
        if (shares === null) throw new ApiError(`Shares for ${holderLabel(h.holder_ref)} must be a safe nonnegative integer.`);
        return { ...h, shares };
      });
      await saveHoldings(record.id, holders);
      await refresh();
      setValidated(false);
      setValidationHash(null);
      setMessage("Review saved. Run validation before locking.");
      toast.success("Review saved", "Draft share changes saved successfully.");
    });
  }

  async function upload() {
    await run(async () => {
      if (!file || !/\.csv$/i.test(file.name)) throw new ApiError("Select a file with the .csv extension.");
      if (file.size === 0 || file.size > 5 * 1024 * 1024) throw new ApiError("CSV size must be greater than 0 and no more than 5 MiB.");
      const content = await file.text();
      if (content.includes("\u0000")) throw new ApiError("The CSV contains unsupported binary characters.");
      await importHoldings(record.id, content);
      await refresh();
      setFile(null);
      if (input.current) input.current.value = "";
      setValidated(false); setConfirmed(false); setValidationHash(null);
      setMessage("CSV saved. Ledger updated successfully; run validation to continue.");
      toast.success("CSV saved", "Ledger loaded successfully from the CSV file.");
    });
  }

  async function validate() {
    if (dirty || busy) return;
    await run(async () => {
      setValidated(false); setValidationHash(null); setConfirmed(false);
      const result = await validateLedger(record.id, record.content_hash);
      if (!result.valid) throw new ApiError(result.errors.join("; ") || "The ledger is not valid. Check reconciliation and shareholder classifications.");
      setValidationHash(result.validation_hash);
      setValidated(true);
      setMessage("Validation successful. The ledger is ready to be set as a locked version.");
      toast.success("Validation successful", "Numeric ledger reconciliation complete; this is not legal verification.");
    });
  }

  async function lock() {
    if (!validated || !validationHash || dirty || !confirmed || !isReviewerOrAdmin) return;
    await run(async () => {
      await lockSnapshot(record.id, validationHash);
      const next = await refresh();
      onLocked(next);
      setMessage("The ledger version has been locked successfully with a SHA-256 hash. Analyses can now be run.");
      toast.success("Snapshot locked", "Ledger version set with a SHA-256 hash.");
    });
  }

  async function revise() {
    await run(async () => {
      const draft = await createDraft({ ...c, snapshot: record.snapshot });
      router.push(`/snapshots/${encodeURIComponent(draft.id)}/verify?company=${encodeURIComponent(c.id)}`);
    });
  }

  const currentHolders = rows.map((h, i) => {
    const s = /^0+$/.test(shareValues[i]) ? 0 : sharesInput(shareValues[i]);
    return s !== null ? { ...h, shares: s } : h;
  });

  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Shareholding ledger</h2>
          <p className="muted">As of {record.snapshot.as_of_date} · total {integer(record.snapshot.total_shares)} shares</p>
        </div>
        {!editable && !isViewer && <button className="button" onClick={revise} disabled={busy}>Create draft revision</button>}
      </div>

      <OwnershipBreakdown holders={currentHolders} totalShares={record.snapshot.total_shares} />

      {!!error && <ErrorBox error={error} />}
      {message && <p className="success-message" role="status">{message}</p>}

      {isViewer && (
        <div className="notice subtle" style={{ borderLeft: "4px solid #475569" }}>
          <strong>Viewer / External auditor mode (Read-only)</strong>
          <p>You can inspect the shareholding ledger and source evidence, but share editing, CSV import, and version locking are disabled for your role.</p>
        </div>
      )}

      {editable && (
        <div className="notice subtle">
          <strong>Editable draft</strong>
          <p>Changes are persisted only after the review is saved or a CSV is successfully imported. Previous locked versions remain intact.</p>
        </div>
      )}

      <div className="table-scroll ledger" tabIndex={0} role="region" aria-label="Shareholding ledger, horizontally scrollable">
        <table>
          <caption>Ledger {companyLabel(c)}{dirty ? " · unsaved changes" : ""}</caption>
          <thead>
            <tr>
              <th scope="col">Shareholder</th>
              <th scope="col">Shares</th>
              <th scope="col">Eligibility / type</th>
              <th scope="col">Classification</th>
              <th scope="col">Evidence reference</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h, i) => (
              <tr key={h.holder_ref}>
                <th scope="row">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                    <div>
                      <div>{holderLabel(h.holder_ref)}</div>
                      <small className="mono">{h.holder_ref}</small>
                    </div>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setSelectedHolder(h)}
                      title="View detailed shareholder profile"
                      style={{ padding: "2px 6px", fontSize: "0.74rem" }}
                    >
                      <EyeIcon size={13} /> Profile
                    </button>
                  </div>
                </th>
                <td className="number">
                  {editable ? (
                    <input
                      aria-label={`Shares ${holderLabel(h.holder_ref)}`}
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
                        aria-label={`Eligibility ${holderLabel(h.holder_ref)}`}
                        disabled={busy}
                        value={h.eligibility}
                        onChange={e => edit(i, { eligibility: e.target.value as Eligibility })}
                      >
                        {(["ELIGIBLE", "INELIGIBLE", "UNKNOWN"] as const).map(v => (
                          <option key={v} value={v}>{eligibilityLabel(v)}</option>
                        ))}
                      </select>
                      <select
                        aria-label={`Type ${holderLabel(h.holder_ref)}`}
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
                            <option value="FALSE">No</option>
                            <option value="TRUE">Yes</option>
                            <option value="UNKNOWN">Unknown</option>
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
                      aria-label={`Evidence reference ${holderLabel(h.holder_ref)}`}
                      disabled={busy}
                      value={h.evidence_ref || ""}
                      onChange={e => edit(i, { evidence_ref: e.target.value || null })}
                    >
                      <option value="">(No evidence reference)</option>
                      {evidenceRefs.map(ref => <option key={ref} value={ref}>{evidenceLabel(ref)}</option>)}
                    </select>
                  ) : (
                    <span className="small">{evidenceLabel(h.evidence_ref)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editable && (
        <Panel title="Ledger Update Actions">
          <div className="actions" style={{ marginBottom: "16px" }}>
            <button className="button" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save review"}
            </button>
            <button className="button secondary" onClick={validate} disabled={busy}>
              {busy ? "Validating…" : "Validate ledger"}
            </button>
          </div>
          <div className="file-field">
            <label htmlFor="csv-upload">Import Shareholding CSV (Maximum 5 MiB)</label>
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
                {busy ? "Uploading…" : `Import ${file.name}`}
              </button>
            )}
          </div>
        </Panel>
      )}

      {record.status === "LOCKED" && (
        <Panel title="Locked Snapshot">
          <p><span className="badge locked" style={{ marginRight: "8px" }}>Locked snapshot</span> This ledger version has been locked with a SHA-256 hash and is ready for analysis.</p>
          <div className="actions" style={{ marginTop: "12px" }}>
            <Link className="button" href={hrefs(c).assessment}>Continue to assessment</Link>
          </div>
        </Panel>
      )}

      {editable && isReviewerOrAdmin && (
        <Panel title="Data Version Locking (Reviewer / Admin)">
          <p className="muted small">
            Once validated and locked, this ledger version becomes immutable and produces a SHA-256 hash to ensure evidence integrity.
          </p>
          <label className="checkbox-row" style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="checkbox"
              id="confirm-lock-checkbox"
              checked={confirmed}
              disabled={!validated || busy || !isReviewerOrAdmin}
              onChange={e => setConfirmed(e.target.checked)}
            />
            <span>I have reviewed the ledger and understand that locking only sets the data version.</span>
          </label>
          <div className="actions" style={{ marginTop: "14px", gap: "8px" }}>
            <button className="button" onClick={() => setLockOpen(true)} disabled={!validated || dirty || !confirmed || busy || !isReviewerOrAdmin}>
              <LockIcon />{busy ? "Locking…" : "Lock snapshot"}
            </button>
          </div>
        </Panel>
      )}

      <Modal
        open={lockOpen}
        onClose={() => { if (!busy) setLockOpen(false); }}
        title="Confirm snapshot lock"
        subtitle="Set shareholding data version for analysis"
        dismissible={!busy}
        footer={<>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => setLockOpen(false)}>Cancel</button>
          <button type="button" className="button" disabled={busy} onClick={async () => { await lock(); setLockOpen(false); }}>
            <LockIcon />{busy ? "Locking…" : "Confirm & Lock Snapshot"}
          </button>
        </>}
      >
        <p>This ledger version cannot be modified once locked. A SHA-256 integrity hash is recorded with the version and serves as the analysis baseline reference.</p>
        <dl className="detail-list">
          <div><dt>Snapshot</dt><dd className="mono">{record.id}</dd></div>
          <div><dt>Position date</dt><dd>{record.snapshot.as_of_date}</dd></div>
          <div><dt>Total shares</dt><dd>{integer(record.snapshot.total_shares)}</dd></div>
        </dl>
        <p className="muted small">This action only establishes the data version; it is not confirmation of legal compliance or external factual truth.</p>
      </Modal>

      <Drawer
        open={Boolean(selectedHolder)}
        onClose={() => setSelectedHolder(null)}
        title={selectedHolder ? holderLabel(selectedHolder.holder_ref) : "Shareholder Details"}
        subtitle={selectedHolder ? `Shareholder Code: ${selectedHolder.holder_ref}` : undefined}
        footer={
          <button type="button" className="button" onClick={() => setSelectedHolder(null)}>Close panel</button>
        }
      >
        {selectedHolder && (
          <dl className="detail-list">
            <div>
              <dt>Entity Identity</dt>
              <dd><strong>{holderLabel(selectedHolder.holder_ref)}</strong></dd>
            </div>
            <div>
              <dt>Reference Code</dt>
              <dd><span className="mono">{selectedHolder.holder_ref}</span></dd>
            </div>
            <div>
              <dt>Eligibility Status</dt>
              <dd>
                <Badge tone={selectedHolder.eligibility === "ELIGIBLE" ? "eligible" : selectedHolder.eligibility === "INELIGIBLE" ? "ineligible" : ""}>
                  {eligibilityLabel(selectedHolder.eligibility)}
                </Badge>
              </dd>
            </div>
            <div>
              <dt>Shareholder Type</dt>
              <dd>{selectedHolder.holder_type}</dd>
            </div>
            <div>
              <dt>Share Count</dt>
              <dd><strong>{integer(selectedHolder.shares)}</strong> shares</dd>
            </div>
            <div>
              <dt>Ownership Share</dt>
              <dd>
                <strong>
                  {record.snapshot.total_shares > 0
                    ? (Number((BigInt(selectedHolder.shares) * 10000n) / BigInt(record.snapshot.total_shares)) / 100).toFixed(2) + "%"
                    : "—"}
                </strong>
              </dd>
            </div>
            {flagFields.map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{flagValue(selectedHolder[key]) === "TRUE" ? "Yes" : flagValue(selectedHolder[key]) === "FALSE" ? "No" : "Unknown"}</dd>
              </div>
            ))}
            <div>
              <dt>Evidence Document</dt>
              <dd>
                {evidenceLabel(selectedHolder.evidence_ref)}
                {selectedHolder.evidence_ref && <details className="provenance"><summary>Technical source reference</summary><code>{selectedHolder.evidence_ref}</code></details>}
              </dd>
            </div>
            <div style={{ marginTop: "16px", padding: "12px", background: "#f8faf9", borderRadius: "6px", border: "1px solid #d8e0db" }}>
              <strong style={{ fontSize: "0.82rem", color: "var(--navy)", display: "block", marginBottom: "4px" }}>
                Synthetic data · Requires verification
              </strong>
              <p className="muted small" style={{ margin: 0 }}>
                Classifications come from the synthetic ledger, not identity or legal eligibility verification. Ratios in this panel are display summaries only; numeric decisions come from the deterministic engine. Unverified rules remain disabled.
              </p>
            </div>
          </dl>
        )}
      </Drawer>

      <Modal
        open={Boolean(leaveHref)}
        onClose={() => setLeaveHref(null)}
        title="Unsaved changes"
        subtitle="Draft ledger changes have not been saved to the server."
        footer={
          <>
            <button type="button" className="secondary-button" onClick={() => setLeaveHref(null)}>Stay Here</button>
            <button
              type="button"
              className="danger-button"
              onClick={() => {
                const target = leaveHref;
                setDirty(false);
                setLeaveHref(null);
                if (target) router.push(target);
              }}
            >
              Discard Changes
            </button>
          </>
        }
      >
        <p>Are you sure you want to leave this page? All unsaved share input changes will be lost.</p>
      </Modal>
    </>
  );
}

function AssessmentView({ company: c, role }: { company: Company; role?: UserRole }) {
  const a = c.assessment;
  if (!a) {
    return (
      <Panel title="Assessment for this version not available">
        <p>Open the latest overview or review the ledger to continue.</p>
        <Link href={hrefs(c).company} className="button secondary">Company overview</Link>
      </Panel>
    );
  }
  return (
    <>
      <AssessmentMetrics assessment={a} />
      <div className="two-columns">
        <Panel title="Numeric assessment results">
          <p className="assessment-status">{numericLabel(a.numeric_target_status)}</p>
          <dl className="detail-list">
            <div><dt>Analysis scope</dt><dd>{assessmentLabel(a.assessment_status)}</dd></div>
            <div><dt>SID count</dt><dd>{integer(c.snapshot.sid_count)}<small>Based on dataset input.</small></dd></div>
            <div><dt>Legal rule readiness</dt><dd>Unverified</dd></div>
            <div><dt>Snapshot</dt><dd>{c.snapshot_state === "LOCKED" ? "Locked for analysis" : "Draft, not yet available for analysis"}</dd></div>
          </dl>
        </Panel>
        <Panel title="Follow-up">
          <p>Review eligibility assumptions and shareholder classifications before building alternative allocations.</p>
          <p>Shareholding changes in an analysis will be re-evaluated across the entire ledger, including recipients crossing the profile's 5% threshold.</p>
          <div className="actions">
            <Link href={hrefs(c).verify} className="button secondary">Review ledger</Link>
            {role && canWrite(role) && <Link href={hrefs(c).scenario} className="button">Create analysis</Link>}
          </div>
        </Panel>
      </div>
      <Limits assessment={a} />
    </>
  );
}

function ScenarioForm({ company: c, locked, role }: { company: Company; locked: boolean; role?: UserRole }) {
  const toast = useToast();
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
  const inFlight = useRef(false);
  const submission = useRef({ payload: "", key: "" });
  const isViewer = !role || !canWrite(role);

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
    if (inFlight.current || !locked || isViewer) return;
    setError(null); setResult(null);
    const next: Record<string, string> = {};
    const shares = amounts.map(sharesInput);
    shares.forEach((value, i) => { if (value === null) next[`shares-${i}`] = "Enter a safe positive integer, without periods or commas."; });
    if (shares.every(v => v !== null) && shares.reduce<bigint>((sum, v) => sum + BigInt(v!), 0n) > BigInt(Number.MAX_SAFE_INTEGER)) {
      next["shares-1"] = "Total allocation exceeds the safe integer limit.";
    }
    if (refs[0] === refs[1]) next["recipient-1"] = "Select two different recipients.";
    if (type === "TRANSFER") {
      if (!holders.some(h => h.holder_ref === seller)) next.seller = "Select the selling shareholder.";
      refs.forEach((ref, i) => { if (ref === seller) next[`recipient-${i}`] = "The recipient cannot be the same as the seller."; });
    }
    evidence.forEach((ref, i) => { if (!catalog.includes(ref)) next[`evidence-${i}`] = "Select an evidence reference from the baseline ledger."; });
    if (!priceValid(price)) next.price = "Use a positive price with a decimal point and at most 2 fractional digits.";
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

    const payload = JSON.stringify([c.snapshot.id, action]);
    if (submission.current.payload !== payload) submission.current = { payload, key: crypto.randomUUID() };
    inFlight.current = true;
    setBusy(true);
    try {
      const data = await simulate(c.snapshot.id, action, submission.current.key);
      submission.current = { payload: "", key: "" };
      setResult(data);
      toast.success("Analysis saved successfully", "Free-float analysis calculated and recorded successfully.");
      requestAnimationFrame(() => resultPanel.current?.focus());
    } catch (e) {
      setError(e);
      toast.error("Analysis failed", e instanceof Error ? e.message : "A server error occurred.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const fieldError = (id: string) => errors[id] ? <span id={`${id}-error`} className="field-error">{errors[id]}</span> : null;

  if (!locked) {
    return (
      <Panel title="Snapshot not locked yet">
        <p>Save your review and ask a reviewer to lock the ledger before creating an analysis. Analyses only use an immutable baseline.</p>
        <Link className="button" href={hrefs(c).verify}>Continue ledger review</Link>
      </Panel>
    );
  }

  return (
    <>
      <div className="scenario-layout">
        <form className="panel" noValidate onSubmit={submit} onChange={() => { setResult(null); setError(null); }}>
          <div className="section-heading">
            <h2>Analysis parameters</h2>
            <div className="actions" style={{ gap: "6px" }}>
              <button
                type="button"
                className="text-button"
                onClick={() => (type === "TRANSFER" ? presetBlockSale() : presetRightsIssue())}
                disabled={busy || isViewer}
              >
                Fill sample allocation
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
              <strong>Viewer mode (read-only)</strong>
              <p>Only the Analyst or Reviewer role can create analyses of ledger movements.</p>
            </div>
          )}

          <fieldset disabled={busy || isViewer}>
            <legend className="sr-only">Allocation input</legend>
            <div className="field">
              <label htmlFor="operation">Action type</label>
              <select id="operation" value={type} onChange={e => { setType(e.target.value as ScenarioAction["action_type"]); setErrors({}); }}>
                <option value="TRANSFER">Transfer shares / Block Sale</option>
                <option value="NEW_ISSUANCE">NEW_ISSUANCE · New issuance</option>
              </select>
            </div>

            {type === "TRANSFER" && (
              <div className="field">
                <label htmlFor="seller">Selling holder</label>
                <select id="seller" value={seller} onChange={e => setSeller(e.target.value)} aria-invalid={!!errors.seller}>
                  {holders.map(h => (
                    <option key={h.holder_ref} value={h.holder_ref}>
                      {holderLabel(h.holder_ref)} · {integer(h.shares)} shares
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
                  <legend>Recipient {letter}</legend>
                  <div className="field">
                    <label htmlFor={`recipient-${i}`}>Recipient {letter} identity</label>
                    <select id={`recipient-${i}`} value={refs[i]} onChange={e => setRefs(replace(refs, i, e.target.value))} aria-invalid={!!errors[`recipient-${i}`]}>
                      {["DEMO-NEW-A", "DEMO-NEW-B"].map(ref => <option key={ref} value={ref}>{holderLabel(ref)}</option>)}
                      {holders.map(h => <option key={h.holder_ref} value={h.holder_ref}>{holderLabel(h.holder_ref)}</option>)}
                    </select>
                    {fieldError(`recipient-${i}`)}
                  </div>
                  <div className="field">
                    <label htmlFor={`shares-${i}`}>Share allocation {letter}</label>
                    <input id={`shares-${i}`} inputMode="numeric" value={amounts[i]} onChange={e => setAmounts(replace(amounts, i, e.target.value))} aria-invalid={!!errors[`shares-${i}`]} />
                    {fieldError(`shares-${i}`)}
                  </div>
                  <div className="field">
                    <label htmlFor={`eligibility-${i}`}>Recipient {letter} eligibility</label>
                    <select id={`eligibility-${i}`} value={eligibilities[i]} onChange={e => setEligibilities(replace(eligibilities, i, e.target.value as Eligibility))}>
                      {(["ELIGIBLE", "INELIGIBLE", "UNKNOWN"] as const).map(v => <option key={v} value={v}>{eligibilityLabel(v)}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={`evidence-${i}`}>Recipient {letter} evidence reference</label>
                    <select id={`evidence-${i}`} value={evidence[i]} onChange={e => setEvidence(replace(evidence, i, e.target.value))} aria-invalid={!!errors[`evidence-${i}`]}>
                      <option value="">(Select an evidence reference)</option>
                      {catalog.map(source => <option key={source} value={source}>{evidenceLabel(source)}</option>)}
                    </select>
                    {fieldError(`evidence-${i}`)}
                  </div>
                </fieldset>
              );
            })}

            <div className="field">
              <label htmlFor="price">Estimated transaction price per share (IDR, optional)</label>
              <input id="price" value={price} onChange={e => setPrice(e.target.value)} placeholder="e.g.: 750.00" aria-invalid={!!errors.price} />
              {fieldError("price")}
            </div>

            <button className="button" type="submit" disabled={busy || isViewer}>
              {busy ? "Calculating…" : "Calculate and save analysis"}
            </button>
          </fieldset>
        </form>

        <section ref={resultPanel as any} tabIndex={-1} aria-label="Analysis results">
          {!!error && <ErrorBox error={error} />}
          {result ? (
            <ResultDetails result={result} company={c} />
          ) : (
            <Panel title="Calculation results">
              <p className="muted">Enter allocations or use a preset, then calculate to see the impact on the free-float ratio.</p>
            </Panel>
          )}
        </section>
      </div>
    </>
  );
}

function ResultDetails({ result: r, company: c }: { result: SimulationResult; company?: Company }) {
  return (
    <Panel title="Saved analysis results">
      <dl className="detail-list">
        <div><dt>Numeric position</dt><dd>{numericLabel(r.assessment.numeric_target_status)}</dd></div>
        <div><dt>New free-float ratio</dt><dd><strong>{percent(r.assessment.free_float_ratio)}</strong></dd></div>
        <div><dt>Cash estimate</dt><dd>{r.cash_estimate_idr == null ? "Not calculated" : `IDR ${decimalText(r.cash_estimate_idr)}`}</dd></div>
      </dl>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Shareholding changes">
        <table>
          <caption>Shareholding changes by holder</caption>
          <thead>
            <tr>
              <th scope="col">Holder</th>
              <th scope="col">Before</th>
              <th scope="col">After</th>
              <th scope="col">Change</th>
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
          <Link className="button" href={hrefs(c).compare}>Select analyses to compare</Link>
        </div>
      )}
      <details className="provenance">
        <summary>Calculation trace</summary>
        <dl className="detail-list">
          <div><dt>Analysis ID</dt><dd className="mono">{r.scenario_id}</dd></div>
          <div><dt>Engine</dt><dd>{r.engine_version}</dd></div>
          <div><dt>Input hash</dt><dd className="mono">{r.input_hash}</dd></div>
          <div><dt>Result hash</dt><dd className="mono">{r.result_hash}</dd></div>
        </dl>
      </details>
    </Panel>
  );
}

function Compare({ company: c, role }: { company: Company; role?: UserRole }) {
  const router = useRouter();
  const toast = useToast();
  const [results, setResults] = useState<SimulationResult[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [baseline, setBaseline] = useState<SnapshotRecord | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const inFlight = useRef(false);
  const reportSubmission = useRef({ payload: "", key: "" });

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
        throw new ApiError("The comparison baseline is not a locked version for this company.");
      }
      setBaseline(version); setComparison(value);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function report() {
    if (!comparison || busy || inFlight.current || !role || !canWrite(role)) return;
    const ids = comparison.scenarios.map(r => r.scenario_id);
    const payload = JSON.stringify(ids);
    if (reportSubmission.current.payload !== payload) reportSubmission.current = { payload, key: crypto.randomUUID() };
    inFlight.current = true;
    setBusy(true); setError(null);
    try {
      const result = await generateReport(ids, reportSubmission.current.key);
      reportSubmission.current = { payload: "", key: "" };
      toast.success("Report saved", "Executive memo saved with an SHA-256 provenance hash.");
      router.push(`/reports/${encodeURIComponent(result.id)}?company=${encodeURIComponent(c.id)}`);
    } catch (e) {
      setError(e);
      inFlight.current = false;
      setBusy(false);
    }
  }

  const selectedSnapshot = results?.find(r => r.scenario_id === selected[0])?.snapshot_id;

  return (
    <>
      {!!error && <ErrorBox error={error} retry={() => setAttempt(a => a + 1)} />}
      {!results && !error ? (
        <Loading>Loading saved analyses…</Loading>
      ) : results?.length === 0 ? (
        <Panel title="No saved analyses yet">
          <p>Create two analyses on the same locked snapshot to compare their impact.</p>
          {role && canWrite(role) && <Link className="button" href={hrefs(c).scenario}>Create first analysis</Link>}
        </Panel>
      ) : results && (
        <>
          <Panel title="Saved analyses">
            <p className="muted">Select exactly two analyses. Options from a different baseline are disabled so the comparison stays comparable.</p>
            <div className="scenario-list">
              {results.map((r, i) => {
                const checked = selected.includes(r.scenario_id);
                const disabled = busy || (!checked && (selected.length >= 2 || (!!selectedSnapshot && selectedSnapshot !== r.snapshot_id)));
                return (
                  <label className={`scenario-choice${disabled ? " is-disabled" : ""}`} key={r.scenario_id}>
                    <input type="checkbox" checked={checked} disabled={disabled} onChange={() => choose(r)} />
                    <span>
                      <strong>{r.action.action_type === "TRANSFER" ? "Share transfer" : "New issuance"} · {r.created_at ? new Date(r.created_at).toLocaleString("en-US") : `Analysis ${i + 1}`}</strong>
                      <small>Baseline {r.snapshot_id.slice(0, 8)} · {r.action.allocations.map(a => `${holderLabel(a.holder_ref)}: ${integer(a.shares)} shares`).join("; ")}</small>
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
                {busy ? "Processing…" : "Compare selections"}
              </button>
              {role && canWrite(role) && <Link className="button secondary" href={hrefs(c).scenario}>Add analysis</Link>}
              <span className="muted small">{selected.length} of 2 selected</span>
            </div>
          </Panel>

          {comparison && baseline && (
            <>
              <ComparisonTable comparison={comparison} company={c} baseline={baseline} />
              <div className="actions">
                {role && canWrite(role) && <button className="button" onClick={report} disabled={busy}>Create saved report</button>}
                <Link className="button secondary" href={hrefs(c).reports}>Report archive</Link>
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
    <div className="table-scroll comparison" tabIndex={0} role="region" aria-label="Baseline and analysis comparison">
      <table>
        <caption>Comparison on baseline {baseline.snapshot.as_of_date} · {baseline.id.slice(0, 8)}</caption>
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col">Baseline<small>Locked version</small></th>
            {comparison.scenarios.map((r, i) => (
              <th scope="col" key={r.scenario_id}>Analysis {i === 0 ? "A" : "B"}<small>{r.action.action_type === "TRANSFER" ? "Share transfer" : "New issuance"}</small></th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Total shares</th>
            <td>{integer(baseline.snapshot.total_shares)}</td>
            {comparison.scenarios.map(r => <td key={r.scenario_id}>{integer(r.assessment.total_shares)}</td>)}
          </tr>
          <tr>
            <th scope="row">Eligible shares</th>
            {assessments.map((a, i) => <td key={i}>{a ? integer(a.eligible_shares) : "Baseline assessment not available"}</td>)}
          </tr>
          <tr className="ratio-row">
            <th scope="row">Free-float ratio</th>
            {assessments.map((a, i) => <td key={i}>{a ? percent(a.free_float_ratio) : "Not available"}</td>)}
          </tr>
          <tr>
            <th scope="row">Numeric target</th>
            {assessments.map((a, i) => <td key={i}>{a ? percent(a.target_ratio) : "Not available"}</td>)}
          </tr>
          <tr>
            <th scope="row">Numeric position</th>
            {assessments.map((a, i) => <td key={i}>{a ? numericLabel(a.numeric_target_status) : "Not available"}</td>)}
          </tr>
          <tr>
            <th scope="row">Cash estimate · IDR</th>
            <td>—</td>
            {comparison.scenarios.map(r => <td key={r.scenario_id}>{r.cash_estimate_idr == null ? "No price entered" : decimalText(r.cash_estimate_idr)}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Reports({ company: c, role: _role }: { company: Company; role?: UserRole }) {
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
    <Panel title="Saved reports & memos">
      {reports.length === 0 ? (
        <>
          <p>No saved reports yet. Select two analyses, compare them, and generate a report.</p>
          <Link className="button" href={hrefs(c).compare}>Select analyses</Link>
        </>
      ) : (
        <ul className="report-list">
          {reports.map((r, i) => (
            <li key={r.id}>
              <div>
                <strong>Free-Float Analysis Memo #{reports.length - i}</strong>
                <small>{r.created_at ? new Date(r.created_at).toLocaleString("en-US") : r.id}</small>
              </div>
              <Link className="button secondary" href={`/reports/${encodeURIComponent(r.id)}?company=${encodeURIComponent(c.id)}`}>
                Open memo
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Report({ resource, company, role: _role }: { resource?: string; company: Company | null; role?: UserRole }) {
  const [report, setReport] = useState<ReportResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [downloadError, setDownloadError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setReport(null); setError(null);
    if (!resource || resource === "new") {
      setError(new ApiError("Reports must be generated from saved analyses. Open the comparison view to generate a report."));
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
        <Loading>Loading saved analysis memo…</Loading>
      ) : (
        <>
          <div className="section-heading">
            <div>
              <h2>Executive Memo Document</h2>
              <p className="muted small">Document ID: <span className="mono">{report.id}</span></p>
            </div>
            <div className="actions" style={{ gap: "8px" }}>
              <button className="button secondary" onClick={printView}>Print / Save as PDF</button>
              <button className="button" onClick={download}>Download Markdown</button>
            </div>
          </div>
          {downloadError && <p className="field-error" role="alert">Download could not be generated. Copy the text from the report preview.</p>}
          <div className="report-document">
            <div className="report-watermark">SYNTHETIC DATA · DETERMINISTIC ANALYSIS · NOT AN OFFICIAL DOCUMENT</div>
            <pre className="memo" tabIndex={0} aria-label="Analysis memo content">{report.markdown_content}</pre>
          </div>
          <Limits />
          <details className="provenance">
            <summary>Source references and hash integrity</summary>
            {report.sources.length ? (
              <ul className="source-list">
                {report.sources.map((source, i) => (
                  <li key={i} className="mono">{typeof source === "string" ? source : JSON.stringify(source)}</li>
                ))}
              </ul>
            ) : (
              <p>Source references not available.</p>
            )}
            <p className="muted small">Synthetic references do not represent real shareholder records.</p>
          </details>
        </>
      )}
      {company && (
        <div className="actions">
          <Link href={hrefs(company).reports} className="button secondary">Report archive</Link>
          <Link href={hrefs(company).compare} className="text-link">Back to comparison</Link>
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
  const [selectedEvent, setSelectedEvent] = useState<AuditEventRecord | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setEvents(null); setError(null);
    getAuditEvents(controller.signal)
      .then(data => { if (!controller.signal.aborted) setEvents(data); })
      .catch(e => { if (!controller.signal.aborted) setError(e); });
    return () => controller.abort();
  }, [attempt]);

  if (error) return <ErrorBox error={error} retry={() => setAttempt(a => a + 1)} />;
  if (!events) return <Loading>Loading audit trail & governance…</Loading>;

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
          <h2>Audit Trail Records</h2>
          <p className="muted small">Database change log. Events record status or data hash changes and request identifiers.</p>
        </div>
        <div className="actions" style={{ gap: "8px" }}>
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{ width: "auto" }}>
            {actions.map(act => <option key={act} value={act}>{act === "ALL" ? "All actions" : act}</option>)}
          </select>
          <input
            placeholder="Search actor / hash / ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: "220px" }}
          />
        </div>
      </div>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Audit trail table">
        <table className="audit-table">
          <thead>
            <tr>
              <th scope="col">Timestamp (Local)</th>
              <th scope="col">Actor & role</th>
              <th scope="col">Action</th>
              <th scope="col">Entity ID</th>
              <th scope="col">Status / hash (before / after)</th>
              <th scope="col">Correlation ID</th>
              <th scope="col">Details</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: "20px" }}>No matching events found.</td></tr>
            ) : (
              filtered.map(ev => (
                <tr key={ev.id} onClick={() => setSelectedEvent(ev)} style={{ cursor: "pointer" }}>
                  <td className="small muted">{ev.created_at ? new Date(ev.created_at).toLocaleString("en-US") : "—"}</td>
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
                      {ev.before_hash && <small className="mono" title={`Before: ${ev.before_hash}`}>Bfr: {ev.before_hash.slice(0, 16)}…</small>}
                      {ev.after_hash && <small className="mono" title={`After: ${ev.after_hash}`}>Aft: {ev.after_hash.slice(0, 16)}…</small>}
                      {!ev.before_hash && !ev.after_hash && <span className="muted small">—</span>}
                    </div>
                  </td>
                  <td><small className="mono muted">{ev.correlation_id}</small></td>
                  <td>
                    <button
                      type="button"
                      className="text-button"
                      onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev); }}
                      style={{ padding: "3px 8px", fontSize: "0.75rem" }}
                    >
                      <EyeIcon size={13} /> Details
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Drawer
        open={Boolean(selectedEvent)}
        onClose={() => setSelectedEvent(null)}
        title="Audit Trail Inspection"
        subtitle={selectedEvent ? `Event ID: ${selectedEvent.id}` : undefined}
        footer={
          <button type="button" className="button" onClick={() => setSelectedEvent(null)}>Close panel</button>
        }
      >
        {selectedEvent && (
          <dl className="detail-list">
            <div>
              <dt>Event ID (UUID)</dt>
              <dd><span className="mono">{selectedEvent.id}</span></dd>
            </div>
            <div>
              <dt>Correlation ID</dt>
              <dd><span className="mono">{selectedEvent.correlation_id}</span></dd>
            </div>
            <div>
              <dt>Timestamp (UTC)</dt>
              <dd><span className="mono">{selectedEvent.created_at}</span></dd>
            </div>
            <div>
              <dt>Local timestamp</dt>
              <dd>{new Date(selectedEvent.created_at).toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>Action</dt>
              <dd><strong>{selectedEvent.action}</strong></dd>
            </div>
            <div>
              <dt>Actor</dt>
              <dd>
                <strong>@{selectedEvent.username || selectedEvent.actor_id.slice(0, 8)}</strong>
                {selectedEvent.actor_role && (
                  <span className={`role-badge ${selectedEvent.actor_role}`} style={{ marginLeft: "8px" }}>
                    {selectedEvent.actor_role}
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt>Affected entity ID</dt>
              <dd><span className="mono">{selectedEvent.entity_id}</span></dd>
            </div>
            <div>
              <dt>Status / hash before</dt>
              <dd><span className="mono small">{selectedEvent.before_hash || "(None - New entity)"}</span></dd>
            </div>
            <div>
              <dt>Status / hash after</dt>
              <dd><span className="mono small">{selectedEvent.after_hash || "(None)"}</span></dd>
            </div>
            <div>
              <dt>Verification note</dt>
              <dd>Persisted record. The panel displays server-recorded digests; it does not perform independent cryptographic verification.</dd>
            </div>
          </dl>
        )}
      </Drawer>
    </>
  );
}

function TeamManagementView({ session }: { session: Session }) {
  const toast = useToast();
  const inFlight = useRef(false);
  const [roleChange, setRoleChange] = useState<{ user: WorkspaceUser; role: UserRole } | null>(null);
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
    if (!newUsername.trim() || newPassword.length < 12 || inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(null); setFormMessage("");
    try {
      await createWorkspaceUser({ username: newUsername.trim(), password: newPassword, role: newRole });
      setNewUsername("");
      setNewPassword("");
      const successMsg = `User @${newUsername.trim()} added successfully as ${roleLabel(newRole)}.`;
      setFormMessage(successMsg);
      toast.success("User added", successMsg);
      setAttempt(a => a + 1);
    } catch (err) {
      setError(err);
      toast.error("Failed to add user", err instanceof Error ? err.message : "A server error occurred.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function handleRoleChange(userId: string, targetRole: UserRole) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(null);
    try {
      await updateWorkspaceUserRole(userId, targetRole);
      toast.success("Permissions updated", `User role updated to ${roleLabel(targetRole)}.`);
      setRoleChange(null);
      setAttempt(a => a + 1);
    } catch (err) {
      setError(err);
      toast.error("Failed to update role", err instanceof Error ? err.message : "A server error occurred.");
      setRoleChange(null);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (session.user.role !== "admin") {
    return (
      <Panel title="Access denied">
        <p>Team management is only accessible to Workspace Administrators.</p>
      </Panel>
    );
  }

  return (
    <>
      {!!error && <ErrorBox error={error} retry={() => setAttempt(a => a + 1)} />}
      {formMessage && <p className="success-message" role="status">{formMessage}</p>}

      <div className="two-columns">
        <Panel title="Workspace users">
          {!users ? <Loading>Loading user list…</Loading> : (
            <div className="table-scroll" tabIndex={0} role="region" aria-label="User table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">User</th>
                    <th scope="col">Active role</th>
                    <th scope="col">Created</th>
                    <th scope="col">Change role</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <th scope="row">
                        <strong>@{u.username}</strong>
                        {u.id === session.user.id && <small className="muted" style={{ display: "block" }}>(Your account)</small>}
                      </th>
                      <td>
                        <span className={`role-badge ${u.role}`}>{roleLabel(u.role)}</span>
                      </td>
                      <td className="small muted">{u.created_at ? new Date(u.created_at).toLocaleDateString("en-US") : "—"}</td>
                      <td>
                        <select
                          aria-label={`Change role @${u.username}`}
                          value={u.role}
                          disabled={busy || u.id === session.user.id}
                          onChange={e => { const role = e.target.value as UserRole; if (role !== u.role) setRoleChange({ user: u, role }); }}
                          style={{ padding: "4px 8px", fontSize: "0.8rem", width: "auto" }}
                        >
                          <option value="admin">Admin</option>
                          <option value="reviewer">Reviewer</option>
                          <option value="analyst">Analyst</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Add new user">
          <form onSubmit={handleAddUser}>
            <div className="field">
              <label htmlFor="user-name">Username</label>
              <input
                id="user-name"
                required
                maxLength={64}
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                placeholder="e.g. corsec_lead"
              />
            </div>
            <div className="field">
              <label htmlFor="user-role">Role & permissions</label>
              <select id="user-role" value={newRole} onChange={e => setNewRole(e.target.value as UserRole)}>
                <option value="analyst">Analyst — Data entry, CSV import, simulation</option>
                <option value="reviewer">Reviewer — Lock snapshot, executive memo</option>
                <option value="admin">Workspace Admin — Full access & team management</option>
                <option value="viewer">Viewer / Auditor — Read-only & audit trail</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="user-password">Password (Minimum 12 characters)</label>
              <input
                id="user-password"
                type="password"
                required
                minLength={12}
                maxLength={256}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Minimum 12 characters"
              />
            </div>
            <button className="button" type="submit" disabled={busy || !newUsername.trim() || newPassword.length < 12}>
              {busy ? "Saving…" : "Register user"}
            </button>
          </form>
        </Panel>
      </div>

      <Modal
        open={Boolean(roleChange)}
        onClose={() => { if (!busy) setRoleChange(null); }}
        dismissible={!busy}
        title="Confirm role change"
        subtitle="Permission changes are recorded in the audit trail."
        footer={<>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => setRoleChange(null)}>Cancel</button>
          <button type="button" className="button" disabled={busy} onClick={() => { if (roleChange) void handleRoleChange(roleChange.user.id, roleChange.role); }}>{busy ? "Saving…" : "Confirm change"}</button>
        </>}
      >
        {roleChange && <p>Change access for <strong>@{roleChange.user.username}</strong> from <strong>{roleLabel(roleChange.user.role)}</strong> to <strong>{roleLabel(roleChange.role)}</strong>? Confirm that the new role matches the user's responsibilities.</p>}
      </Modal>

      <Panel title="Role capability matrix (RBAC)" style={{ marginTop: "24px" }}>
        <p className="muted small" style={{ marginBottom: "16px" }}>
          Authorization is enforced server-side and recorded immutably in the database:
        </p>
        <div className="table-scroll">
          <table className="rbac-table">
            <thead>
              <tr>
                <th scope="col">Capability</th>
                <th scope="col">Viewer / Auditor</th>
                <th scope="col">Analyst</th>
                <th scope="col">Reviewer</th>
                <th scope="col">Workspace Admin</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">View ledger & portfolio</th>
                <td><span className="badge eligible"><CheckIcon size={12} /> Read</span></td>
                <td><span className="badge eligible"><CheckIcon size={12} /> Read</span></td>
                <td><span className="badge eligible"><CheckIcon size={12} /> Read</span></td>
                <td><span className="badge eligible"><CheckIcon size={12} /> Read</span></td>
              </tr>
              <tr>
                <th scope="row">Manual entry & CSV import</th>
                <td><span className="badge ineligible"><XIcon size={12} /> Denied</span></td>
                <td><span className="badge eligible"><CheckIcon size={12} /> Write</span></td>
                <td><span className="badge eligible"><CheckIcon size={12} /> Write</span></td>
                <td><span className="badge eligible"><CheckIcon size={12} /> Write</span></td>
              </tr>
              <tr>
                <th scope="row">Validate reconciliation</th>
                <td><span className="badge ineligible"><XIcon size={12} /> Denied</span></td>
                <td><span className="badge eligible"><CheckIcon size={12} /> Execute</span></td>
                <td><span className="badge eligible"><CheckIcon size={12} /> Execute</span></td>
                <td><span className="badge eligible"><CheckIcon size={12} /> Execute</span></td>
              </tr>
              <tr>
                <th scope="row">Lock snapshot (SHA-256)</th>
                <td><span className="badge ineligible"><XIcon size={12} /> Denied</span></td>
                <td><span className="badge ineligible"><XIcon size={12} /> Denied (403)</span></td>
                <td><span className="badge eligible"><CheckIcon size={12} /> Lock</span></td>
                <td><span className="badge eligible"><CheckIcon size={12} /> Lock</span></td>
              </tr>
              <tr>
                <th scope="row">Run transfer / issuance analysis</th>
                <td><span className="badge ineligible"><XIcon size={12} /> Denied</span></td>
                <td><span className="badge eligible"><CheckIcon size={12} /> Analyze</span></td>
                <td><span className="badge eligible"><CheckIcon size={12} /> Analyze</span></td>
                <td><span className="badge eligible"><CheckIcon size={12} /> Analyze</span></td>
              </tr>
              <tr>
                <th scope="row">Draft & download executive memo</th>
                <td><span className="badge eligible"><CheckIcon size={12} /> Read / Download</span></td>
                <td><span className="badge eligible"><CheckIcon size={12} /> Draft</span></td>
                <td><span className="badge eligible"><CheckIcon size={12} /> Generate memo</span></td>
                <td><span className="badge eligible"><CheckIcon size={12} /> Generate memo</span></td>
              </tr>
              <tr>
                <th scope="row">Audit trail access</th>
                <td><span className="badge eligible"><CheckIcon size={12} /> Full read</span></td>
                <td><span className="badge ineligible"><XIcon size={12} /> Denied</span></td>
                <td><span className="badge eligible"><CheckIcon size={12} /> Full read</span></td>
                <td><span className="badge eligible"><CheckIcon size={12} /> Full read</span></td>
              </tr>
              <tr>
                <th scope="row">Team & role management</th>
                <td><span className="badge ineligible"><XIcon size={12} /> Denied</span></td>
                <td><span className="badge ineligible"><XIcon size={12} /> Denied</span></td>
                <td><span className="badge ineligible"><XIcon size={12} /> Denied</span></td>
                <td><span className="badge eligible"><CheckIcon size={12} /> Full access</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
