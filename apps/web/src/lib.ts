import type { ApiErrorPayload, Assessment, Company, ScenarioAction, SimulationResult, ReportResult } from "./types/api";

export const API = "/api/v1";
export class ApiError extends Error {
  constructor(message: string, public correlationId?: string) { super(message); }
}

export async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store", signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError("API tidak dapat dijangkau. Pastikan layanan API aktif, lalu coba lagi.");
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const problem = payload as ApiErrorPayload | null;
    const detail = typeof problem?.detail === "string" ? problem.detail : typeof problem?.title === "string" ? problem.title : "Permintaan tidak dapat diproses.";
    const fields = Array.isArray(problem?.field_errors) ? problem.field_errors.map(f => `${f.field}: ${f.message}`).join("; ") : "";
    throw new ApiError(`API ${response.status}: ${detail}${fields ? ` — ${fields}` : ""}`, problem?.correlation_id);
  }
  if (!payload) throw new ApiError("Respons API kosong atau bukan JSON. Tidak ada hasil yang ditampilkan.");
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
  if (!record(v) || v.demo !== true || ![v.id, v.code, v.legal_name, v.board].every(x => typeof x === "string") || !validSnapshot(v.snapshot) || (v.assessment !== undefined && !validAssessment(v.assessment))) {
    throw new ApiError("Kontrak data perusahaan tidak valid atau bukan data demo. Tampilan diblokir agar angka tidak menyesatkan.");
  }
  return v as unknown as Company;
}
export async function getCompanies(signal?: AbortSignal) {
  const data = await request<unknown>("/demo/companies", undefined, signal);
  if (!Array.isArray(data)) throw new ApiError("Daftar perusahaan dari API tidak valid.");
  return data.map(validateCompany);
}
export async function getCompany(code: string, signal?: AbortSignal) {
  return validateCompany(await request(`/demo/companies/${encodeURIComponent(code)}`, undefined, signal));
}
export async function simulate(company: string, action: ScenarioAction, signal?: AbortSignal): Promise<SimulationResult> {
  const v = await request<unknown>("/demo/simulations", { company_id: company, action }, signal);
  if (!record(v) || !validAssessment(v.assessment) || !validSnapshot(v.snapshot) || !record(v.action) || !["TRANSFER", "NEW_ISSUANCE"].includes(String(v.action.action_type)) || !Array.isArray(v.action.allocations) ||
    ![v.scenario_id, v.input_hash, v.result_hash, v.engine_version, v.company_id].every(x => typeof x === "string") ||
    (v.cash_estimate_idr !== null && !decimal(v.cash_estimate_idr)) || !Array.isArray(v.dilution_by_holder) ||
    !v.dilution_by_holder.every(d => record(d) && typeof d.holder_ref === "string" && decimal(d.old_ratio) && decimal(d.new_ratio) && decimal(d.percentage_point_change))) {
    throw new ApiError("Kontrak hasil simulasi tidak valid. Tidak ada angka pengganti atau hasil lokal.");
  }
  return v as unknown as SimulationResult;
}
export async function generateReport(company: string, actions: ScenarioAction[], signal?: AbortSignal): Promise<ReportResult> {
  const v = await request<unknown>("/demo/reports", { company_id: company, actions }, signal);
  if (!record(v) || typeof v.id !== "string" || typeof v.markdown_content !== "string" || v.watermark !== "SIMULATION_ONLY" || !Array.isArray(v.sources)) throw new ApiError("Memo API tidak valid atau tidak memiliki watermark simulasi.");
  return v as unknown as ReportResult;
}

export function sharesInput(value: string): number | null {
  if (!/^\d{1,16}$/.test(value)) return null;
  const integer = BigInt(value);
  return integer > 0n && integer <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(integer) : null;
}
export const priceValid = (v: string) => v === "" || (/^\d{1,15}(\.\d{1,2})?$/.test(v) && /[1-9]/.test(v));
export function validAction(v: unknown): v is ScenarioAction {
  if (!record(v) || !["TRANSFER", "NEW_ISSUANCE"].includes(String(v.action_type)) ||
    (v.action_type === "TRANSFER" && (typeof v.seller_ref !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(v.seller_ref))) ||
    !Array.isArray(v.allocations) || v.allocations.length !== 2 ||
    !(v.price_idr_per_share === undefined || (typeof v.price_idr_per_share === "string" && priceValid(v.price_idr_per_share)))) return false;
  return v.allocations.every(a => record(a) && typeof a.holder_ref === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(a.holder_ref) &&
    safeInteger(a.shares) && a.shares > 0 && ["ELIGIBLE", "INELIGIBLE", "UNKNOWN"].includes(String(a.eligibility)) &&
    ["ORGANIZATION", "PERSON"].includes(String(a.holder_type)) && typeof a.evidence_ref === "string" && a.evidence_ref.startsWith("fixture://")) &&
    v.allocations[0].holder_ref !== v.allocations[1].holder_ref && v.allocations.every(a => a.holder_ref !== v.seller_ref);
}
export function preset(type: ScenarioAction["action_type"], companyOrCode: Company | string = "DEMO-001"): ScenarioAction {
  const code = typeof companyOrCode === "string" ? companyOrCode : companyOrCode.code;
  // Engine only allows evidence_refs from the baseline catalog.
  // Use the first available fixture ref from the snapshot, or the standard eligible-bucket.
  const evidenceRef = typeof companyOrCode !== "string"
    ? companyOrCode.snapshot.holders.find(h => h.evidence_ref)?.evidence_ref || `fixture://${code.toLowerCase()}/eligible-bucket`
    : `fixture://${code.toLowerCase()}/eligible-bucket`;
  return {
    action_type: type,
    ...(type === "TRANSFER" ? { seller_ref: "TRANSFER-SELLER" } : {}),
    allocations: ["A", "B"].map(letter => ({
      holder_ref: `DEMO-NEW-${letter}`,
      shares: type === "TRANSFER" ? 25000000 : 29411765,
      eligibility: "ELIGIBLE",
      holder_type: "ORGANIZATION",
      evidence_ref: evidenceRef,
    })),
  };
}
export const storageKey = (code: string) => `floatpath:scenarios:v1:${code}`;
export function readActions(company: Company): ScenarioAction[] {
  try {
    const raw = sessionStorage.getItem(storageKey(company.code));
    if (!raw || raw.length > 32000) return [];
    const v: unknown = JSON.parse(raw);
    if (!record(v) || v.version !== 1 || v.company !== company.code || v.snapshot !== company.snapshot.id || !Array.isArray(v.actions) || v.actions.length > 2) return [];
    return v.actions.filter(validAction);
  } catch { return []; }
}
export function saveResult(company: Company, action: ScenarioAction, result: SimulationResult): boolean {
  try {
    const actions = [...readActions(company).filter(a => JSON.stringify(a) !== JSON.stringify(action)), action].slice(-2);
    sessionStorage.setItem(storageKey(company.code), JSON.stringify({ version: 1, company: company.code, snapshot: company.snapshot.id, actions, last_result: result }));
    return true;
  } catch { return false; }
}
export function comparisonActions(company: Company): ScenarioAction[] {
  const saved = readActions(company);
  if (saved.length === 2) return saved;
  const first = saved[0] || preset("TRANSFER", company);
  return [first, preset(first.action_type === "TRANSFER" ? "NEW_ISSUANCE" : "TRANSFER", company)];
}

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
export const numericLabel = (s: Assessment["numeric_target_status"]) => ({ PASS_NUMERIC: "Target numerik tercapai", BELOW_TARGET: "Di bawah target numerik", UNKNOWN: "Belum dapat ditentukan" })[s];
