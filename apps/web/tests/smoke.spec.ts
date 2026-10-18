import { test, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import type { AuditEventRecord, SnapshotRecord, ValidationResult, UserRole } from "../src/types/api";
import { canAccessScreen, canLock, canWrite, type Screen } from "../src/access";

// FR-002/007/008/009/012/013, INT-003, E2E-001/002/008.
// Real synthetic API; credentials provided via environment only.
type Role = "viewer" | "admin" | "analyst";
const sessions = new Map<Role | undefined, Awaited<ReturnType<BrowserContext["cookies"]>>>();

function credentials(role?: Role) {
  const prefix = role ? `FLOATPATH_E2E_${role.toUpperCase()}` : "FLOATPATH_E2E";
  const username = process.env[`${prefix}_USERNAME`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!username || !password) throw new Error(`Set ${prefix}_USERNAME and ${prefix}_PASSWORD to an explicitly provisioned synthetic account.`);
  return { username, password };
}

async function login(page: Page, role?: Role, fresh = false) {
  const { username, password } = credentials(role);
  const cached = sessions.get(role);
  if (cached && !fresh) {
    await page.context().addCookies(cached);
    await page.goto("/workspace");
  } else {
    await page.goto("/login");
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/workspace$/, { timeout: 15000 });
    if (!fresh) sessions.set(role, await page.context().cookies());
  }
  await expect(page).toHaveURL(/\/workspace$/, { timeout: 15000 });
  await expect(page.getByRole("heading", { name: "Company portfolio" })).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".account .data-pill")).toHaveText(/synthetic data/i);
}

async function openCompany(page: Page) {
  await page.locator(".company-card").first().getByRole("link", { name: "Open company" }).click();
  await expect(page).toHaveURL(/\/companies\/[^/?]+$/, { timeout: 15000 });
  await expect(page.getByRole("heading", { name: "Company overview", exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("link", { name: "Review ledger", exact: true })).toBeVisible({ timeout: 15000 });
  return new URL(page.url()).pathname.split("/").at(-1)!;
}

async function getSnapshotRecord(page: Page, id: string): Promise<SnapshotRecord> {
  const response = await page.request.get(`/api/v1/snapshots/${encodeURIComponent(id)}`);
  expect(response.status(), "Read persisted snapshot").toBe(200);
  const record: SnapshotRecord = await response.json();
  expect(record.content_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  return record;
}

async function openDraftLedger(page: Page) {
  const companyId = await openCompany(page);
  await page.getByRole("link", { name: "Review ledger", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Shareholding ledger", exact: true })).toBeVisible({ timeout: 15000 });
  const snapshotId = new URL(page.url()).pathname.split("/").at(-2)!;
  let record = await getSnapshotRecord(page, snapshotId);
  const balanced = (value: SnapshotRecord) => value.snapshot.holders.reduce((sum, holder) => sum + BigInt(holder.shares), 0n) === BigInt(value.snapshot.total_shares);

  if (!balanced(record)) {
    // Preserve bad draft history; only derive a revision from a real locked baseline.
    const response = await page.request.get("/api/v1/workspace/audit-events?limit=200");
    expect(response.status(), "Locate a known locked baseline through audit history").toBe(200);
    const events: AuditEventRecord[] = await response.json();
    let baseline: SnapshotRecord | undefined;
    const lockedIds = [...new Set(events.filter(event => event.action === "LOCK_SNAPSHOT").map(event => event.entity_id))];
    for (const id of lockedIds) {
      const candidate = await getSnapshotRecord(page, id);
      if (candidate.company_id === companyId && candidate.status === "LOCKED" && balanced(candidate)) {
        baseline = candidate;
        break;
      }
    }
    expect(baseline, "Unbalanced latest draft: provision a valid locked baseline; do not repair shares or delete history").toBeDefined();
    const { id: _id, ...snapshot } = baseline!.snapshot;
    void _id;
    const revision = await page.request.post(`/api/v1/companies/${encodeURIComponent(companyId)}/snapshots`, {
      headers: { Origin: new URL(page.url()).origin },
      data: snapshot,
    });
    expect(revision.status(), "Create balanced revision from immutable baseline").toBe(201);
    record = await revision.json();
    await page.goto(`/snapshots/${encodeURIComponent(record.id)}/verify?company=${encodeURIComponent(companyId)}`);
  } else if (record.status === "LOCKED") {
    await page.getByRole("button", { name: "Create draft revision", exact: true }).click();
    await expect(page).not.toHaveURL(new RegExp(`/snapshots/${snapshotId}/verify`));
    record = await getSnapshotRecord(page, new URL(page.url()).pathname.split("/").at(-2)!);
  }
  expect(record.status).toBe("DRAFT");
  expect(balanced(record), "Draft shares must remain reconciled").toBeTruthy();
  await expect(page.getByRole("button", { name: "Save review", exact: true })).toBeVisible({ timeout: 15000 });
  return record;
}

async function validateCurrentLedger(page: Page, record: SnapshotRecord) {
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/snapshots/${record.id}:validate` && response.request().method() === "POST");
  await page.getByRole("button", { name: "Validate ledger", exact: true }).click();
  const response = await pending;
  expect(response.status()).toBe(200);
  expect(response.request().headers()["if-match"]).toBe(`"${record.content_hash}"`);
  const validation: ValidationResult = await response.json();
  expect(validation.valid).toBe(true);
  expect(validation.validation_hash).toBe(record.content_hash);
  await expect(page.locator(".success-message")).toContainText("Validation successful");
  return validation.validation_hash;
}

async function expectNativeModal(dialog: Locator) {
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  expect(await dialog.evaluate(element => element instanceof HTMLDialogElement && element.open && element.matches(":modal"))).toBeTruthy();
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBeTruthy();
}

function recordApiRequests(page: Page) {
  const requests: Array<{ method: string; path: string }> = [];
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/v1/")) requests.push({ method: request.method(), path });
  });
  return requests;
}

async function expectDeniedWithoutProtectedRequests(page: Page, href: string) {
  const requests = recordApiRequests(page);
  await page.goto(href);
  await expect(page.getByRole("heading", { name: /^Access denied$/i })).toBeVisible({ timeout: 15000 });
  await page.waitForLoadState("networkidle");
  expect(requests).toContainEqual({ method: "GET", path: "/api/v1/auth/session" });
  expect(requests.filter(request => request.path !== "/api/v1/auth/session")).toEqual([]);
  await expect(page.locator(".error-box")).toHaveCount(0);
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
}

test("authorization policy rejects unknown roles and screens", () => {
  const screens: Screen[] = ["workspace", "company", "verify", "assessment", "scenario", "compare", "reports", "report", "audit", "team"];
  for (const value of [undefined, null, "", "owner", "ADMIN"]) {
    const role = value as UserRole;
    expect(canWrite(role)).toBe(false);
    expect(canLock(role)).toBe(false);
    for (const screen of screens) expect(canAccessScreen(role, screen)).toBe(false);
  }
  for (const role of ["viewer", "analyst", "reviewer", "admin"] as const) {
    expect(canAccessScreen(role, "unregistered" as Screen)).toBe(false);
  }
});

test("unauthenticated workspace redirects to login without credential quick-picks", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Username")).toHaveValue("");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await expect(page.locator(".role-quick-cards button")).toHaveCount(0);
  await expect(page.getByText("DEMO · READ ONLY")).toHaveCount(0);
});

test("incorrect credentials do not create a session", async ({ page }) => {
  const { username, password } = credentials();
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(`${password}-incorrect`);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  const response = await page.request.get("/api/v1/auth/session");
  expect(response.status()).toBe(401);
});

test("service failure shows retry instead of substitute company results", async ({ page }) => {
  await login(page);
  await page.route("**/api/v1/workspace/companies", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Service temporarily unavailable." }) }));
  await page.reload();
  await expect(page.locator(".error-box")).toContainText("503");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.locator(".company-card")).toHaveCount(0);
});

test("persisted workflow: unsaved leave cancel, review save toast, lock cancel & confirm, analyses, compare, report, logout", async ({ page, context }) => {
  test.setTimeout(60000);
  await login(page);
  const cookies = await context.cookies();
  expect(cookies.some(cookie => cookie.httpOnly)).toBeTruthy();
  await openDraftLedger(page);

  // Unsaved changes navigation leave modal
  const ledgerUrl = page.url();
  const sharesInput = page.locator(".ledger input").first();
  const originalShares = await sharesInput.inputValue();
  await sharesInput.fill(`${originalShares}0`);
  await page.locator("nav").getByRole("link", { name: "Company portfolio", exact: true }).click();
  const leaveDialog = page.getByRole("dialog", { name: "Unsaved changes", exact: true });
  await expectNativeModal(leaveDialog);
  await leaveDialog.getByRole("button", { name: "Stay Here", exact: true }).click();
  await expect(leaveDialog).toHaveCount(0);
  await expect(page).toHaveURL(ledgerUrl);
  await expect(sharesInput).toHaveValue(`${originalShares}0`);
  await expect(page.locator(".ledger caption")).toContainText("unsaved changes");
  // Restore balanced baseline shares before continuing so validateLedger succeeds
  await sharesInput.fill(originalShares);

  // Save changes and assert unique status message vs toast card
  await page.getByRole("button", { name: "Save review", exact: true }).click();
  await expect(page.locator(".success-message")).toContainText("Review saved");
  const savedToast = page.locator(".toast-card").filter({ hasText: "Review saved" });
  await expect(savedToast).toBeVisible();
  await savedToast.getByRole("button", { name: /Close notification/ }).click();
  await expect(savedToast).toHaveCount(0);
  await expect(page.locator(".success-message")).toContainText("Review saved");

  // Validate the persisted content hash, not a fallback or the engine data_hash.
  const record = await getSnapshotRecord(page, new URL(page.url()).pathname.split("/").at(-2)!);
  const validationHash = await validateCurrentLedger(page, record);

  // Mandatory lock confirmation modal (cancel then confirm)
  const lockButton = page.getByRole("button", { name: /^Lock snapshot$/i });
  await expect(lockButton).toBeDisabled();
  await page.getByLabel("I have reviewed the ledger and understand that locking only sets the data version.").check();
  await expect(lockButton).toBeEnabled();

  const requests = recordApiRequests(page);
  const lockRequests = () => requests.filter(request => request.method === "POST" && /\/snapshots\/[^/]+:lock$/.test(request.path));
  await lockButton.click();
  const lockDialog = page.getByRole("dialog", { name: /Confirm snapshot lock/i });
  await expectNativeModal(lockDialog);
  expect(lockRequests()).toHaveLength(0);
  await lockDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(lockDialog).toHaveCount(0);
  await expect(lockButton).toBeFocused();
  expect(lockRequests()).toHaveLength(0);
  await expect(page.locator(".page-heading .badge")).toHaveText("Draft ledger");

  await lockButton.click();
  await expectNativeModal(lockDialog);
  const lockedResponse = page.waitForResponse(response => /\/api\/v1\/snapshots\/[^/]+:lock$/.test(new URL(response.url()).pathname) && response.request().method() === "POST");
  await lockDialog.getByRole("button", { name: /Confirm & Lock Snapshot/i }).click();
  const lockResponse = await lockedResponse;
  expect(lockResponse.status()).toBe(200);
  expect(lockResponse.request().headers()["if-match"]).toBe(`"${validationHash}"`);
  await expect(lockDialog).toHaveCount(0);
  expect(lockRequests()).toHaveLength(1);
  await expect(page.locator(".page-heading .badge")).toHaveText("Locked snapshot");

  // Assessment & analysis creation
  await page.getByRole("link", { name: "Continue to assessment" }).click();
  await expect(page.getByRole("heading", { name: "Free-float assessment", exact: true })).toBeVisible({ timeout: 15000 });
  await page.locator('main a[href^="/scenarios/new"]').click();
  await expect(page.getByRole("heading", { name: /Analysis parameters/i })).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Fill sample allocation" }).click();
  await page.getByRole("button", { name: /Calculate and save analysis/i }).click();
  await expect(page.getByRole("heading", { name: /Saved analysis results/i })).toBeVisible({ timeout: 15000 });

  // Second analysis (NEW_ISSUANCE)
  await page.reload();
  await expect(page.getByRole("heading", { name: /Analysis parameters/i })).toBeVisible({ timeout: 15000 });
  await page.getByLabel("Action type").selectOption("NEW_ISSUANCE");
  await page.getByRole("button", { name: "Fill sample allocation" }).click();
  await page.getByRole("button", { name: /Calculate and save analysis/i }).click();
  await expect(page.getByRole("heading", { name: /Saved analysis results/i })).toBeVisible({ timeout: 15000 });

  // Comparison & saved report
  await page.locator('main a[href^="/scenarios/compare"]').click();
  const choices = page.locator(".scenario-choice input[type=checkbox]:not(:disabled)");
  await expect(choices.first()).toBeVisible({ timeout: 15000 });
  await choices.first().check();
  await page.locator(".scenario-choice input[type=checkbox]:not(:disabled):not(:checked)").first().check();
  await page.getByRole("button", { name: "Compare selections" }).click();
  await expect(page.locator(".comparison table")).toBeVisible();
  await page.getByRole("button", { name: "Create saved report" }).click();
  await expect(page).toHaveURL(/\/reports\/[^/?]+\?company=/, { timeout: 15000 });
  await expect(page.locator("pre.memo")).toContainText("SIMULATION");
  await expect(page.locator(".report-watermark")).toContainText(/SYNTHETIC DATA · DETERMINISTIC ANALYSIS · NOT AN OFFICIAL DOCUMENT/);
  await expect(page.locator(".account .data-pill")).toHaveText(/synthetic data/i);
  const reportUrl = page.url();
  const content = await page.locator("pre.memo").textContent();
  await page.reload();
  await expect(page.locator("pre.memo")).toHaveText(content!);
  expect(page.url()).toBe(reportUrl);

  // Logout and verify protected report redirect
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  sessions.delete(undefined);
  await expect(page).toHaveURL(/\/login$/);
  await page.goto(reportUrl);
  await expect(page).toHaveURL(/\/login$/);
});

for (const operation of ["validate", "lock"] as const) {
  test(`concurrent balanced draft edit rejects stale ${operation} and requires fresh validation`, async ({ page, context }) => {
    test.setTimeout(60000);
    await login(page);
    const record = await openDraftLedger(page);
    const lockCheckbox = page.getByLabel("I have reviewed the ledger and understand that locking only sets the data version.");
    const lockButton = page.getByRole("button", { name: /^Lock snapshot$/i });
    const lockDialog = page.getByRole("dialog", { name: /Confirm snapshot lock/i });
    if (operation === "lock") {
      await validateCurrentLedger(page, record);
      await lockCheckbox.check();
      await lockButton.click();
      await expectNativeModal(lockDialog);
    }

    // A second tab saves a real, reconciled change without logging in again.
    const concurrent = await context.newPage();
    try {
      await concurrent.goto(page.url());
      const inputs = concurrent.locator(".ledger input");
      await expect(inputs.first()).toBeVisible({ timeout: 15000 });
      const first = BigInt(await inputs.nth(0).inputValue()) - 1n;
      const second = BigInt(await inputs.nth(1).inputValue()) + 1n;
      expect(first >= 0n && second <= BigInt(Number.MAX_SAFE_INTEGER)).toBeTruthy();
      await inputs.nth(0).fill(String(first));
      await inputs.nth(1).fill(String(second));
      await concurrent.getByRole("button", { name: "Save review", exact: true }).click();
      await expect(concurrent.locator(".success-message")).toContainText("Review saved");
    } finally {
      await concurrent.close();
    }
    const changed = await getSnapshotRecord(page, record.id);
    expect(changed.content_hash).not.toBe(record.content_hash);
    expect(changed.snapshot.holders.reduce((sum, holder) => sum + BigInt(holder.shares), 0n)).toBe(BigInt(changed.snapshot.total_shares));

    const pending = page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/snapshots/${record.id}:${operation}` && response.request().method() === "POST");
    if (operation === "lock") {
      await lockDialog.getByRole("button", { name: /Confirm & Lock Snapshot/i }).click();
    } else {
      await page.getByRole("button", { name: "Validate ledger", exact: true }).click();
    }
    const response = await pending;
    expect(response.status()).toBe(409);
    expect(response.request().headers()["if-match"]).toBe(`"${record.content_hash}"`);
    expect((await response.json()).code).toBe("SNAPSHOT_CHANGED");
    await expect(lockDialog).toHaveCount(0);
    await expect(page.locator(".error-box")).toContainText("The ledger has changed since your review");
    await expect(page.locator(".toast-card.toast-error")).toContainText("The ledger has changed");
    await expect(lockCheckbox).not.toBeChecked();
    await expect(lockButton).toBeDisabled();
    await expect(page.locator(".ledger input").first()).toHaveValue(String(changed.snapshot.holders[0].shares));
    expect((await getSnapshotRecord(page, record.id)).status).toBe("DRAFT");
    await validateCurrentLedger(page, changed);
    await expect(lockButton).toBeDisabled();
    await lockCheckbox.check();
    await expect(lockButton).toBeEnabled();
  });
}

test("analysis field validation, keyboard skip link, and mobile viewport have no overflow", async ({ page }, testInfo) => {
  await login(page);
  const companyId = await openCompany(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/scenarios/new?company=${encodeURIComponent(companyId)}`);
  const notLocked = page.getByRole("heading", { name: "Snapshot not locked yet" });
  const parameters = page.getByRole("heading", { name: /Analysis parameters/i });
  await expect(notLocked.or(parameters)).toBeVisible({ timeout: 15000 });
  if (await notLocked.isVisible()) {
    await page.getByRole("link", { name: "Continue ledger review" }).click();
    await expect(page.getByRole("heading", { name: "Shareholding ledger" })).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Validate ledger", exact: true }).click();
    await expect(page.locator(".success-message")).toContainText("Validation successful");
    await page.getByLabel("I have reviewed the ledger and understand that locking only sets the data version.").check();
    await page.getByRole("button", { name: /^Lock snapshot$/i }).click();
    const lockDialog = page.getByRole("dialog", { name: /Confirm snapshot lock/i });
    await lockDialog.getByRole("button", { name: /Confirm & Lock Snapshot/i }).click();
    await expect(lockDialog).toHaveCount(0);
    await page.goto(`/scenarios/new?company=${encodeURIComponent(companyId)}`);
  }
  await expect(page.getByRole("heading", { name: /Analysis parameters/i })).toBeVisible({ timeout: 15000 });
  await page.getByLabel("Share allocation A").fill("abc");
  await page.getByRole("button", { name: /Calculate and save analysis/i }).click();
  await expect(page.locator("#shares-0-error")).toBeVisible();
  await expect(page.getByLabel("Share allocation A")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Share allocation A")).toBeFocused();
  await expectNoHorizontalOverflow(page);
  await page.locator(".skip-link").focus();
  await expect(page.locator(".skip-link")).toBeVisible();
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  const screenshot = await page.screenshot({ path: testInfo.outputPath("mobile-analysis-validation.png"), fullPage: true });
  expect(screenshot.readUInt32BE(16)).toBe(390);
  await testInfo.attach("mobile-analysis-validation", { body: screenshot, contentType: "image/png" });
});

test("viewer role has read-only ledger, profile and audit drawers with Escape focus restore", async ({ page }) => {
  await login(page, "viewer");
  await expect(page.locator(".account .role-badge")).toContainText(/Viewer/);
  await openCompany(page);
  await expect(page.locator('nav a[href^="/scenarios/new"]')).toHaveCount(0);
  await expect(page.locator('nav a[href="/team"]')).toHaveCount(0);

  // Read-only ledger
  await page.getByRole("link", { name: "Review ledger", exact: true }).click();
  await expect(page.getByText(/Viewer \/ External auditor mode/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("button", { name: "Create draft revision" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save review" })).toHaveCount(0);
  await expect(page.locator(".ledger input")).toHaveCount(0);

  // Profile drawer Escape key focus restore
  const profile = page.locator(".ledger").getByRole("button", { name: "Profile", exact: true }).first();
  await profile.click();
  const profileDialog = page.locator("dialog.drawer-backdrop");
  await expectNativeModal(profileDialog);
  await expect(profileDialog).toContainText("Reference Code");
  await expect(profileDialog).toContainText(/Synthetic data/);
  await page.keyboard.press("Escape");
  await expect(profileDialog).toHaveCount(0);
  await expect(profile).toBeFocused();

  // Audit trail drawer Escape key focus restore
  await page.locator('nav a[href="/audit"]').click();
  await expect(page.getByRole("heading", { name: /Audit trail records/i })).toBeVisible({ timeout: 15000 });
  const detail = page.getByRole("region", { name: "Audit trail table", exact: true }).getByRole("button", { name: "Details", exact: true }).first();
  await detail.click();
  const auditDialog = page.getByRole("dialog", { name: "Audit Trail Inspection", exact: true });
  await expectNativeModal(auditDialog);
  await expect(auditDialog).toContainText(/Status \/ hash after/i);
  await expect(auditDialog).toContainText(/Status \/ hash before/i);
  await expect(auditDialog).not.toContainText(/Digest After/i);
  await expect(auditDialog).toContainText("does not perform independent cryptographic verification");
  await page.keyboard.press("Escape");
  await expect(auditDialog).toHaveCount(0);
  await expect(detail).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
});

test("viewer direct analysis creation is denied before company or protected data requests", async ({ page }) => {
  await login(page, "viewer");
  const companyId = await openCompany(page);
  await expect(page.locator('nav a[href^="/scenarios/new"]')).toHaveCount(0);
  await expectDeniedWithoutProtectedRequests(page, `/scenarios/new?company=${encodeURIComponent(companyId)}`);
  await expect(page.getByRole("button", { name: /Calculate and save (analysis|scenario)/i })).toHaveCount(0);
});

test("viewer can compare and read saved reports but cannot add analyses or create reports", async ({ page }, testInfo) => {
  await login(page, "viewer");
  const companyId = await openCompany(page);
  const requests = recordApiRequests(page);
  await page.goto(`/scenarios/compare?company=${encodeURIComponent(companyId)}`);
  await expect(page.locator(".scenario-choice").first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('a[href^="/scenarios/new"]')).toHaveCount(0);

  const choices = page.locator(".scenario-choice input[type=checkbox]:not(:disabled)");
  await choices.first().check();
  await page.locator(".scenario-choice input[type=checkbox]:not(:disabled):not(:checked)").first().check();
  await page.getByRole("button", { name: "Compare selections", exact: true }).click();
  await expect(page.locator(".comparison table")).toBeVisible();
  await expect(page.getByRole("button", { name: /Create saved report/i })).toHaveCount(0);
  await expect(page.locator('a[href^="/scenarios/new"]')).toHaveCount(0);

  // Read saved report
  await page.locator('main a[href^="/reports?"]').click();
  await expect(page.locator(".report-list")).toBeVisible({ timeout: 15000 });
  await page.locator('.report-list a[href*="/reports/"]').first().click();
  await expect(page.locator("pre.memo")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".report-watermark")).toContainText(/SYNTHETIC DATA · DETERMINISTIC ANALYSIS · NOT AN OFFICIAL DOCUMENT/);
  await expect(page.locator(".account .data-pill")).toHaveText(/synthetic data/i);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Markdown", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^FloatPath-Memo-.+\.md$/);
  expect(await download.failure()).toBeNull();

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  const screenshot = await page.screenshot({ path: testInfo.outputPath("mobile-viewer-report.png"), fullPage: true });
  expect(screenshot.readUInt32BE(16)).toBe(390);
  await testInfo.attach("mobile-viewer-report", { body: screenshot, contentType: "image/png" });
  const writes = requests.filter(request => request.method !== "GET");
  expect(writes).toEqual([{ method: "POST", path: "/api/v1/scenario-comparisons" }]);
});

for (const role of [undefined, "viewer", "analyst"] as const) {
  test(`${role || "reviewer"} cannot navigate to team or request protected users`, async ({ page }) => {
    await login(page, role);
    await expect(page.locator('nav a[href="/team"]')).toHaveCount(0);
    await expectDeniedWithoutProtectedRequests(page, "/team");
    await expect(page.getByRole("heading", { name: "Workspace users", exact: true })).toHaveCount(0);
  });
}

test("analyst audit route is denied without fetching audit events", async ({ page }) => {
  await login(page, "analyst");
  await expect(page.locator('nav a[href="/audit"]')).toHaveCount(0);
  await expectDeniedWithoutProtectedRequests(page, "/audit");
  await expect(page.getByRole("region", { name: "Audit trail table", exact: true })).toHaveCount(0);
});

// FR-013: choosing a company enables context links, never additional role permissions.
for (const role of ["viewer", "analyst", undefined, "admin"] as const) {
  test(`${role || "reviewer"} keeps its sidebar permissions after opening a company and reloading`, async ({ page }) => {
    await login(page, role);
    const expectedRole = role || "reviewer";
    const commonScreens = ["Company overview", expectedRole === "viewer" ? "View shareholdings" : "Review shareholdings", "Free-float assessment", "Compare analyses", "Report archive"];
    const expectedScreens = [
      "Company portfolio", ...commonScreens,
      ...(expectedRole !== "viewer" ? ["Create analysis"] : []),
      ...(expectedRole !== "analyst" ? ["Audit trail & governance"] : []),
      ...(expectedRole === "admin" ? ["Team management & authorization"] : []),
    ].sort();
    const sidebar = page.getByRole("navigation", { name: "Main navigation" });
    const assertRole = async () => {
      const response = await page.request.get("/api/v1/auth/session");
      expect(response.status()).toBe(200);
      expect((await response.json()).user.role).toBe(expectedRole);
    };
    await assertRole();
    await openCompany(page);
    await expect(async () => {
      expect((await sidebar.getByRole("link").allTextContents()).map(text => text.trim()).sort()).toEqual(expectedScreens);
    }).toPass();
    await assertRole();
    const companyLinks = await sidebar.locator('a:not([href="/workspace"]):not([href="/audit"]):not([href="/team"])').evaluateAll(elements => elements.map(element => (element as HTMLAnchorElement).getAttribute("href")!));
    for (const href of companyLinks) {
      await sidebar.locator(`a[href="${href}"]`).click();
      await expect(page).toHaveURL(new URL(href, page.url()).href);
      await expect(async () => {
        expect((await sidebar.getByRole("link").allTextContents()).map(text => text.trim()).sort()).toEqual(expectedScreens);
      }).toPass();
      await expect(page.getByRole("heading", { name: /^Access denied$/i })).toHaveCount(0);
      if (href.startsWith("/snapshots/")) {
        await expect(page.getByRole("heading", { name: "Shareholding ledger", exact: true })).toBeVisible();
        if (expectedRole === "viewer") {
          await expect(page.locator(".ledger input, .ledger select")).toHaveCount(0);
          await expect(page.getByRole("button", { name: /Create draft revision|Save review|Validate ledger/ })).toHaveCount(0);
        }
        if (["viewer", "analyst"].includes(expectedRole)) {
          await expect(page.getByRole("button", { name: /^Lock snapshot$/i })).toHaveCount(0);
          await expect(page.getByLabel("I have reviewed the ledger and understand that locking only sets the data version.")).toHaveCount(0);
        }
      }
    }
    await page.reload();
    await expect(async () => {
      expect((await sidebar.getByRole("link").allTextContents()).map(text => text.trim()).sort()).toEqual(expectedScreens);
    }).toPass();
    await assertRole();
    if (expectedRole !== "admin") await expectDeniedWithoutProtectedRequests(page, "/team");
    if (expectedRole === "analyst") await expectDeniedWithoutProtectedRequests(page, "/audit");
  });
}

test("admin sees team RBAC and cancelling role confirmation never sends PATCH", async ({ page }) => {
  await login(page, "admin");
  await expect(page.locator(".account .role-badge")).toHaveText("Admin Workspace");
  await page.locator('nav a[href="/team"]').click();
  await expect(page).toHaveURL(/\/team$/, { timeout: 15000 });
  await expect(page.getByRole("heading", { name: "Team management & authorization", exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("heading", { name: "Workspace users", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add new user", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Role capability matrix/ })).toBeVisible();
  const userTable = page.getByRole("region", { name: "User table", exact: true });
  for (const role of [undefined, "viewer", "admin", "analyst"] as const) {
    await expect(userTable.getByText(`@${credentials(role).username}`, { exact: true })).toBeVisible();
  }
  const roleSelect = userTable.getByRole("combobox", { name: `Change role @${credentials("viewer").username}`, exact: true });
  await expect(roleSelect).toHaveValue("viewer");
  const requests = recordApiRequests(page);
  await roleSelect.selectOption("analyst");
  const dialog = page.getByRole("dialog", { name: "Confirm role change", exact: true });
  await expectNativeModal(dialog);
  await expect(dialog).toContainText(`@${credentials("viewer").username}`);
  expect(requests.filter(request => request.method === "PATCH")).toEqual([]);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(roleSelect).toHaveValue("viewer");
  await page.reload();
  await expect(page.getByRole("combobox", { name: `Change role @${credentials("viewer").username}`, exact: true })).toHaveValue("viewer");
  expect(requests.filter(request => request.method === "PATCH")).toEqual([]);
});
