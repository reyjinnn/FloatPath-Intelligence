import type { UserRole } from "./types/api";

export type Screen = "workspace" | "company" | "verify" | "assessment" | "scenario" | "compare" | "reports" | "report" | "audit" | "team";

export const canWrite = (role: UserRole) => ["analyst", "reviewer", "admin"].includes(role);
export const canLock = (role: UserRole) => ["reviewer", "admin"].includes(role);

export function canAccessScreen(role: UserRole, screen: Screen) {
  if (screen === "team") return role === "admin";
  if (screen === "audit") return ["viewer", "reviewer", "admin"].includes(role);
  if (screen === "scenario") return canWrite(role);
  return ["viewer", "analyst", "reviewer", "admin"].includes(role)
    && ["workspace", "company", "verify", "assessment", "compare", "reports", "report"].includes(screen);
}
