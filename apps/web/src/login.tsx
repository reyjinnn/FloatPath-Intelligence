"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError, getSession, login } from "./lib";

const DEMO_ACCOUNTS = [
  { role: "admin", label: "Admin Workspace", user: "admin", pass: "AdminFloatPath2026!", desc: "Kelola tim, jejak audit, kunci snapshot" },
  { role: "reviewer", label: "Reviewer (Corsec)", user: "reviewer", pass: "ReviewerFloatPath2026!", desc: "Kunci snapshot imutabel, persetujuan memo" },
  { role: "analyst", label: "Analis (BAE)", user: "analyst", pass: "AnalystFloatPath2026!", desc: "Tinjau ledger, impor CSV, buat skenario" },
  { role: "viewer", label: "Auditor (Read-Only)", user: "viewer", pass: "ViewerFloatPath2026!", desc: "Tinjau data, verifikasi hash, jejak audit" },
];

export default function Login() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    const controller = new AbortController();
    getSession(controller.signal).then(() => router.replace("/workspace")).catch(e => {
      if (!controller.signal.aborted && !(e instanceof ApiError && e.status === 401)) setError(e);
    });
    return () => controller.abort();
  }, [router]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!username.trim() || !password || busy) return;
    setBusy(true); setError(null);
    try { await login(username.trim(), password); setPassword(""); router.replace("/workspace"); }
    catch (e) { setError(e); setPassword(""); setBusy(false); }
  }
  function pickAccount(acc: typeof DEMO_ACCOUNTS[0]) {
    setUsername(acc.user);
    setPassword(acc.pass);
    setError(null);
  }
  return (
    <main className="login-layout">
      <section className="login-identity">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">fp</span>
          <span>FloatPath<small>INTELLIGENCE</small></span>
        </div>
        <div>
          <p className="eyebrow">OWNERSHIP INTELLIGENCE</p>
          <h1>Ruang kerja analisis kepemilikan.</h1>
          <p>Ledger, tata kelola, jejak audit, dan skenario dalam satu alur kerja enterprise yang terjaga.</p>
        </div>
        <div className="login-roles-info">
          <p className="muted small" style={{ marginBottom: "0.5rem" }}>Pilih profil peran untuk demonstrasi & pengujian:</p>
          <div className="role-quick-cards">
            {DEMO_ACCOUNTS.map(acc => (
              <button
                type="button"
                key={acc.role}
                className="role-quick-card"
                onClick={() => pickAccount(acc)}
              >
                <div className="role-card-header">
                  <strong>{acc.label}</strong>
                  <span className="mono small">@{acc.user}</span>
                </div>
                <p className="small muted">{acc.desc}</p>
              </button>
            ))}
          </div>
        </div>
        <span className="data-pill">Data sintetis terisolasi</span>
      </section>
      <section className="login-form">
        <form onSubmit={submit}>
          <p className="eyebrow">AKSES WORKSPACE</p>
          <h2>Masuk ke FloatPath</h2>
          <p className="muted">Gunakan kredensial resmi sesuai wewenang peran Anda.</p>
          {!!error && (
            <div className="error-box" role="alert">
              <strong>Belum dapat masuk</strong>
              <p>{error instanceof Error ? error.message : "Terjadi kesalahan."}</p>
              {error instanceof ApiError && error.correlationId && <small>ID permintaan: {error.correlationId}</small>}
            </div>
          )}
          <fieldset disabled={busy}>
            <legend className="sr-only">Kredensial akun</legend>
            <div className="field">
              <label htmlFor="username">Nama pengguna</label>
              <input id="username" name="username" autoComplete="username" required maxLength={150} value={username} onChange={event => setUsername(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="password">Kata sandi</label>
              <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={event => setPassword(event.target.value)} />
            </div>
            <button className="button" type="submit">{busy ? "Memeriksa wewenang…" : "Masuk"}</button>
          </fieldset>
          <p className="small muted">Otorisasi RBAC aktif. Akses fitur dibatasi server secara ketat berdasarkan peran pengguna.</p>
        </form>
      </section>
    </main>
  );
}
