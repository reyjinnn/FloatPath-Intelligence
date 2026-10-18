"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError, getSession, login } from "./lib";
import { ShieldIcon, LockIcon, UsersIcon, FileTextIcon, EyeIcon } from "./icons";

const ACCESS_ROLES = [
  { label: "Administrator", desc: "Team and workspace authorization settings", Icon: UsersIcon },
  { label: "Reviewer", desc: "Ledger review and version locking", Icon: ShieldIcon },
  { label: "Analyst", desc: "Ledger processing and analysis drafting", Icon: FileTextIcon },
  { label: "Viewer", desc: "Read access to reports and audit trail", Icon: LockIcon },
];

export default function Login() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const submitting = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    getSession(controller.signal).then(() => router.replace("/workspace")).catch(e => {
      if (!controller.signal.aborted && !(e instanceof ApiError && e.status === 401)) setError(e);
    });
    return () => controller.abort();
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!username.trim() || !password || submitting.current) return;
    submitting.current = true;
    setBusy(true); setError(null);
    try { await login(username.trim(), password); setPassword(""); router.replace("/workspace"); }
    catch (e) { setError(e); setPassword(""); setBusy(false); submitting.current = false; }
  }

  return (
    <main className="login-layout">
      <section className="login-identity" aria-label="About FloatPath">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">fp</span>
          <span>FloatPath<small>INTELLIGENCE</small></span>
        </div>
        <div>
          <p className="eyebrow">OWNERSHIP INTELLIGENCE</p>
          <h1>Data clarity.<br />Traceable decisions.</h1>
          <p>Shareholder ledgers, deterministic calculations, and analysis documentation in a single workspace.</p>
        </div>
        <div className="login-roles-info">
          <p className="small">Controlled role-based access</p>
          <div className="role-quick-cards">
            {ACCESS_ROLES.map(({ label, desc, Icon }) => (
              <div key={label} className="role-quick-card">
                <div className="role-card-header"><Icon size={16} /><strong>{label}</strong></div>
                <p className="small">{desc}</p>
              </div>
            ))}
          </div>
        </div>
        <span className="data-pill">Synthetic data · Not a legal compliance assessment</span>
      </section>
      <section className="login-form">
        <form onSubmit={submit} aria-busy={busy}>
          <p className="eyebrow">WORKSPACE ACCESS</p>
          <h2>Welcome back</h2>
          <p className="muted">Sign in using credentials provided by your workspace administrator.</p>
          {!!error && (
            <div className="error-box" role="alert">
              <strong>Unable to sign in</strong>
              <p>{error instanceof Error ? error.message : "An error occurred."}</p>
              {error instanceof ApiError && error.correlationId && <small>Request ID: {error.correlationId}</small>}
            </div>
          )}
          <fieldset disabled={busy}>
            <legend className="sr-only">Account credentials</legend>
            <div className="field">
              <label htmlFor="username">Username</label>
              <input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={64} value={username} onChange={event => setUsername(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required maxLength={256} value={password} onChange={event => setPassword(event.target.value)} />
              <button type="button" className="text-button" aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}><EyeIcon /> {showPassword ? "Hide password" : "Show password"}</button>
            </div>
            <button className="button" type="submit"><LockIcon />{busy ? "Checking access…" : "Sign in"}</button>
          </fieldset>
          <p className="small muted" style={{ marginTop: "20px" }}><ShieldIcon /> Access protected by server authorization. Credentials are not stored in browser storage.</p>
        </form>
      </section>
    </main>
  );
}
