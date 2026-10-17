import type { ApiErrorPayload, Assessment, Company, ScenarioAction, SimulationResult, ReportResult, Session, SnapshotRecord, Comparison, Holder, ValidationResult, AuditEventRecord, WorkspaceUser, UserRole } from "./types/api";

export const API = "/api/v1";
export class ApiError extends Error {
  constructor(message: string, public correlationId?: string, public status?: number) { super(message); }
}
export async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers: body === undefined ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store", signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError("Layanan tidak dapat dijangkau. Periksa koneksi lalu coba lagi.");
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login" && typeof window !== "undefined" && window.location.pathname !== "/login") window.location.replace("/login");
    const problem = payload as ApiErrorPayload | null;
    const detail = typeof problem?.detail === "string" ? problem.detail : typeof problem?.title === "string" ? problem.title : "Permintaan tidak dapat diproses.";
    const fields = Array.isArray(problem?.field_errors) ? problem.field_errors.map(f => `${f.field}: ${f.message}`).join("; ") : "";
    throw new ApiError(`${response.status === 401 ? "Sesi atau kredensial tidak valid" : `Permintaan gagal (${response.status})`}: ${detail}${fields ? ` — ${fields}` : ""}`, problem?.correlation_id, response.status);
  }
  if (response.status === 204) return undefined as T;
  if (payload === null) throw new ApiError("Respons layanan tidak valid. Tidak ada hasil pengganti yang ditampilkan.");
  return payload as T;
}
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const safeInteger = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const decimal = (v: unknown): v is string => typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) && v.length < 160;
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === "string");
function validAssessment(v: unknown): v is Assessment {
  return record(v) && safeInteger(v.total_shares) && (v.eligible_shares === null || safeInteger(v.eligible_shares)) &&
    (v.free_float_ratio === null || decimal(v.free_float_ratio)) && decimal(v.target_ratio) &&
    ["PASS_NUMERIC", "BELOW_TARGET", "UNKNOWN"].includes(String(v.numeric_target_status)) &&
    ["SIMULATION_ONLY", "REQUIRES_VERIFICATION", "UNSUPPORTED_RULE"].includes(String(v.assessment_status)) &&
    [v.rule_set_id, v.rule_version, v.rule_status, v.data_hash].every(x => typeof x === "string") && strings(v.warnings) && strings(v.unresolved_constraints);
}
function validSnapshot(v: unknown): boolean {
  return record(v) && typeof v.id === "string" && typeof v.as_of_date === "string" && safeInteger(v.total_shares) &&
    (v.sid_count === null || safeInteger(v.sid_count)) && Array.isArray(v.holders) && v.holders.every(h => record(h) &&
      typeof h.holder_ref === "string" && safeInteger(h.shares) && typeof h.holder_type === "string" &&
      ["ELIGIBLE", "INELIGIBLE", "UNKNOWN"].includes(String(h.eligibility)) && (h.evidence_ref == null || typeof h.evidence_ref === "string") &&
      [h.controller, h.controller_affiliate, h.director_commissioner, h.treasury, h.restricted].every(f => f == null || typeof f === "boolean" || ["TRUE", "FALSE", "UNKNOWN"].includes(String(f))));
}
export function validateCompany(v: unknown): Company {
  if (!record(v) || v.demo !== true || (v.data_mode !== undefined && v.data_mode !== "SYNTHETIC") || ![v.id, v.code, v.legal_name, v.board].every(x => typeof x === "string") || !validSnapshot(v.snapshot) || (v.assessment != null && !validAssessment(v.assessment))) throw new ApiError("Data perusahaan tidak sesuai kontrak workspace sintetis. Tampilan diblokir.");
  return v as unknown as Company;
}
function validateSession(v: unknown): Session {
  if (!record(v) || !record(v.user) || ![v.user.id, v.user.username].every(x => typeof x === "string") || !["viewer", "analyst", "reviewer", "admin"].includes(String(v.user.role)) || !record(v.workspace) || v.workspace.data_mode !== "SYNTHETIC" || typeof v.workspace.name !== "string") throw new ApiError("Informasi sesi tidak valid. Hubungi pengelola workspace.");
  return v as unknown as Session;
}
export async function getSession(signal?: AbortSignal) { return validateSession(await request("/auth/session", undefined, signal)); }
export async function login(username: string, password: string) { return validateSession(await request("/auth/login", { username, password })); }
export async function logout() { await request("/auth/logout", {}); }
export async function getCompanies(signal?: AbortSignal) {
  const data = await request<unknown>("/workspace/companies", undefined, signal);
  if (!Array.isArray(data)) throw new ApiError("Daftar perusahaan tidak valid.");
  return data.map(validateCompany);
}
export async function getCompany(id: string, signal?: AbortSignal) { return validateCompany(await request(`/workspace/companies/${encodeURIComponent(id)}`, undefined, signal)); }
function validateSnapshotRecord(v: unknown): SnapshotRecord {
  if (!record(v) || ![v.id, v.company_id].every(x => typeof x === "string") || !["DRAFT", "LOCKED"].includes(String(v.status)) || !validSnapshot(v.snapshot)) throw new ApiError("Versi ledger tidak valid. Perubahan tidak diteruskan.");
  const result = v as unknown as SnapshotRecord;
  return { ...result, snapshot: { ...result.snapshot, id: result.id } };
}
export async function getSnapshot(id: string, signal?: AbortSignal) { return validateSnapshotRecord(await request(`/snapshots/${encodeURIComponent(id)}`, undefined, signal)); }
export async function createDraft(company: Company) {
  const { id: _id, ...snapshot } = company.snapshot;
  void _id;
  return validateSnapshotRecord(await request(`/companies/${encodeURIComponent(company.id)}/snapshots`, { ...snapshot, board: snapshot.board || company.board }));
}
export async function saveHoldings(id: string, holders: Holder[]) { await request(`/snapshots/${encodeURIComponent(id)}/holdings:review`, { holders }); }
export async function importHoldings(id: string, csv: string) { await request(`/snapshots/${encodeURIComponent(id)}/holdings:import`, { csv_content: csv }); }
export async function validateLedger(id: string): Promise<ValidationResult> {
  const value = await request<unknown>(`/snapshots/${encodeURIComponent(id)}:validate`, {});
  if (!record(value) || typeof value.valid !== "boolean" || !Array.isArray(value.errors)) throw new ApiError("Respons validasi ledger tidak valid.");
  return { ...value, errors: value.errors.map(item => typeof item === "string" ? item : JSON.stringify(item)) } as ValidationResult;
}
export async function lockSnapshot(id: string) {
  const value = await request<unknown>(`/snapshots/${encodeURIComponent(id)}:lock`, {});
  if (!record(value) || value.status !== "LOCKED" || value.id !== id) throw new ApiError("Penguncian belum terkonfirmasi. Muat ulang versi ledger sebelum melanjutkan.");
}
export function validateSimulation(v: unknown): SimulationResult {
  if (!record(v) || !validAssessment(v.assessment) || !validSnapshot(v.snapshot) || !record(v.action) || !["TRANSFER", "NEW_ISSUANCE"].includes(String(v.action.action_type)) || !Array.isArray(v.action.allocations) ||
    ![v.scenario_id, v.snapshot_id, v.input_hash, v.result_hash, v.engine_version, v.company_id].every(x => typeof x === "string") ||
    (v.cash_estimate_idr !== null && !decimal(v.cash_estimate_idr)) || !Array.isArray(v.dilution_by_holder) ||
    !v.dilution_by_holder.every(d => record(d) && typeof d.holder_ref === "string" && decimal(d.old_ratio) && decimal(d.new_ratio) && decimal(d.percentage_point_change))) throw new ApiError("Hasil skenario tidak valid. Tidak ada perhitungan pengganti di perangkat ini.");
  return v as unknown as SimulationResult;
}
export async function simulate(snapshotId: string, action: ScenarioAction): Promise<SimulationResult> { return validateSimulation(await request(`/snapshots/${encodeURIComponent(snapshotId)}/scenarios`, action)); }
export async function getScenario(id: string, signal?: AbortSignal) { return validateSimulation(await request(`/scenarios/${encodeURIComponent(id)}/result`, undefined, signal)); }
export async function getScenarios(company: string, signal?: AbortSignal) {
  const values = await request<unknown>(`/workspace/companies/${encodeURIComponent(company)}/scenarios`, undefined, signal);
  if (!Array.isArray(values)) throw new ApiError("Daftar skenario tidak valid.");
  return values.map(validateSimulation);
}
export async function compareScenarios(ids: string[]): Promise<Comparison> {
  const v = await request<unknown>("/scenario-comparisons", { scenario_ids: ids });
  if (!record(v) || typeof v.snapshot_id !== "string" || !Array.isArray(v.scenarios) || v.scenarios.length !== ids.length || v.watermark !== "SIMULATION_ONLY") throw new ApiError("Perbandingan tidak valid.");
  const scenarios = v.scenarios.map(item => validateSimulation(record(item) ? { snapshot_id: v.snapshot_id, company_id: v.company_id, ...item } : item));
  if (scenarios.some(r => r.snapshot_id !== v.snapshot_id || !ids.includes(r.scenario_id))) throw new ApiError("Perbandingan diblokir: versi baseline tidak sama.");
  return { snapshot_id: v.snapshot_id, scenarios, watermark: v.watermark };
}
function validateReport(v: unknown): ReportResult {
  if (!record(v) || typeof v.id !== "string" || typeof v.markdown_content !== "string" || v.watermark !== "SIMULATION_ONLY" || !Array.isArray(v.sources)) throw new ApiError("Laporan tidak valid atau penanda data sintetis tidak tersedia.");
  return v as unknown as ReportResult;
}
export async function generateReport(ids: string[]) { return validateReport(await request("/reports", { scenario_ids: ids })); }
export async function getReport(id: string, signal?: AbortSignal) { return validateReport(await request(`/reports/${encodeURIComponent(id)}`, undefined, signal)); }
export async function getReports(company: string, signal?: AbortSignal) {
  const values = await request<unknown>(`/workspace/companies/${encodeURIComponent(company)}/reports`, undefined, signal);
  if (!Array.isArray(values)) throw new ApiError("Daftar laporan tidak valid.");
  return values.map(validateReport);
}
export async function getAuditEvents(signal?: AbortSignal): Promise<AuditEventRecord[]> {
  const data = await request<unknown>("/workspace/audit-events", undefined, signal);
  if (!Array.isArray(data)) throw new ApiError("Jejak audit tidak valid.");
  return data as AuditEventRecord[];
}
export async function getWorkspaceUsers(signal?: AbortSignal): Promise<WorkspaceUser[]> {
  const data = await request<unknown>("/workspace/users", undefined, signal);
  if (!Array.isArray(data)) throw new ApiError("Daftar pengguna tidak valid.");
  return data as WorkspaceUser[];
}
export async function createWorkspaceUser(user: { username: string; password: string; role: UserRole }): Promise<WorkspaceUser> {
  const data = await request<unknown>("/workspace/users", user);
  if (!record(data) || typeof data.id !== "string") throw new ApiError("Gagal menambahkan pengguna.");
  return data as unknown as WorkspaceUser;
}
export async function updateWorkspaceUserRole(id: string, role: UserRole): Promise<WorkspaceUser> {
  const response = await fetch(`${API}/workspace/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
    cache: "no-store",
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const problem = payload as ApiErrorPayload | null;
    throw new ApiError(problem?.detail || "Gagal memperbarui peran pengguna.");
  }
  return payload as WorkspaceUser;
}
export function roleLabel(role: UserRole | string | undefined): string {
  switch (role) {
    case "admin": return "Admin Workspace";
    case "reviewer": return "Reviewer (Corsec)";
    case "analyst": return "Analis Kepemilikan (BAE)";
    case "viewer": return "Auditor / Pemirsa (Hanya-Baca)";
    default: return role || "Tidak diketahui";
  }
}
export function sharesInput(value: string): number | null {
  if (!/^\d{1,16}$/.test(value)) return null;
  const integer = BigInt(value);
  return integer > 0n && integer <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(integer) : null;
}
export const priceValid = (v: string) => v === "" || (/^\d{1,15}(\.\d{1,2})?$/.test(v) && /[1-9]/.test(v));
export const integer = (v: number | null | undefined) => v == null ? "Belum diketahui" : Number.isSafeInteger(v) ? v.toLocaleString("id-ID") : "Angka tidak aman";
export function decimalText(value: string | null | undefined, shift = 0): string {
  if (value == null || !/^-?\d+(\.\d+)?$/.test(value)) return "Belum diketahui";
  const sign = value.startsWith("-") ? "−" : "";
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  const digits = whole + fraction.padEnd(shift, "0");
  const index = whole.length + shift;
  const main = digits.slice(0, index).replace(/^0+(?=\d)/, "");
  const tail = digits.slice(index);
  const truncated = /[1-9]/.test(tail.slice(6));
  const shown = tail.slice(0, 6).replace(/0+$/, "").padEnd(2, "0");
  return `${truncated ? "≈ " : ""}${sign}${main.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${shown}`;
}
export const percent = (v: string | null | undefined) => v == null ? "Belum diketahui" : `${decimalText(v, 2)}%`;
export const numericLabel = (s: Assessment["numeric_target_status"]) => ({ PASS_NUMERIC: "Target numerik tercapai", BELOW_TARGET: "Di bawah target numerik", UNKNOWN: "Belum dapat dinilai" })[s];
export const assessmentLabel = (s: Assessment["assessment_status"]) => ({ SIMULATION_ONLY: "Analisis simulasi", REQUIRES_VERIFICATION: "Perlu verifikasi", UNSUPPORTED_RULE: "Profil belum didukung" })[s];
export const companyLabel = (c: Company) => c.presentation_code || c.code;
export const holderLabel = (ref: string) => ({ "CTRL-1": "Pemegang pengendali (fiktif)", "TRANSFER-SELLER": "Pemegang strategis A (fiktif)", "ELIGIBLE-BUCKET": "Kelompok pemegang publik (fiktif)", "OTHER-INELIGIBLE": "Pemegang nonpublik (fiktif)", "DEMO-NEW-A": "Investor Institusi A (fiktif)", "DEMO-NEW-B": "Investor Institusi B (fiktif)" })[ref] || ref;
