import { test, expect, type Page } from "@playwright/test";

function credentials() {
  const username = process.env.FLOATPATH_E2E_USERNAME;
  const password = process.env.FLOATPATH_E2E_PASSWORD;
  if (!username || !password) throw new Error("Set FLOATPATH_E2E_USERNAME and FLOATPATH_E2E_PASSWORD to a seeded reviewer account. Start the real API and seed synthetic companies before running E2E tests.");
  return { username, password };
}
async function login(page: Page) {
  const { username, password } = credentials();
  await page.goto("/login");
  await page.getByLabel("Nama pengguna").fill(username);
  await page.getByLabel("Kata sandi", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.getByRole("heading", { name: "Portofolio perusahaan" })).toBeVisible();
}

test("unauthenticated workspace redirects to a real login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Nama pengguna")).toBeVisible();
  await expect(page.getByLabel("Kata sandi", { exact: true })).toHaveAttribute("type", "password");
  await expect(page.getByText("DEMO · READ ONLY")).toHaveCount(0);
});

test("incorrect credentials do not create a session", async ({ page }) => {
  const { username, password } = credentials();
  await page.goto("/login");
  await page.getByLabel("Nama pengguna").fill(username);
  await page.getByLabel("Kata sandi", { exact: true }).fill(`${password}-incorrect`);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  const response = await page.request.get("/api/v1/auth/session");
  expect(response.status()).toBe(401);
});

test("service failure shows retry instead of substitute company results", async ({ page }) => {
  await login(page);
  await page.route("**/api/v1/workspace/companies", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Layanan sementara tidak tersedia." }) }));
  await page.reload();
  await expect(page.locator(".error-box")).toContainText("503");
  await expect(page.getByRole("button", { name: "Coba lagi" })).toBeVisible();
  await expect(page.locator(".company-card")).toHaveCount(0);
});

test("persisted workflow: draft, review, lock, two scenarios, comparison, saved report, logout", async ({ page, context }) => {
  await login(page);
  const cookies = await context.cookies();
  expect(cookies.some(cookie => cookie.httpOnly)).toBeTruthy();
  await page.locator(".company-card").first().getByRole("link", { name: "Buka perusahaan" }).click();
  await page.getByRole("link", { name: "Tinjau ledger", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ledger kepemilikan" })).toBeVisible();
  if (await page.getByRole("button", { name: "Buat revisi draft" }).isVisible()) await page.getByRole("button", { name: "Buat revisi draft" }).click();
  await expect(page.getByRole("button", { name: "Simpan tinjauan" })).toBeVisible();
  await page.getByRole("button", { name: "Simpan tinjauan" }).click();
  await expect(page.getByRole("status")).toContainText("Tinjauan tersimpan");
  await page.getByRole("button", { name: "Validasi ledger" }).click();
  await expect(page.getByRole("status")).toContainText("Validasi berhasil");
  await page.getByLabel("Saya telah meninjau ledger dan memahami bahwa penguncian hanya menetapkan versi data.").check();
  await page.getByRole("button", { name: "Kunci snapshot" }).click();
  await expect(page.getByText("Snapshot terkunci").first()).toBeVisible();
  await page.getByRole("link", { name: "Lanjut ke asesmen" }).click();
  await expect(page.getByRole("heading", { name: "Asesmen free float", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Buat skenario", exact: true }).last().click();
  await page.getByRole("button", { name: "Isi contoh alokasi" }).click();
  await page.getByRole("button", { name: "Hitung dan simpan skenario" }).click();
  await expect(page.getByRole("heading", { name: "Hasil skenario tersimpan" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Parameter skenario" })).toBeVisible();
  await page.getByLabel("Jenis aksi").selectOption("NEW_ISSUANCE");
  await page.getByRole("button", { name: "Isi contoh alokasi" }).click();
  await page.getByRole("button", { name: "Hitung dan simpan skenario" }).click();
  await expect(page.getByRole("heading", { name: "Hasil skenario tersimpan" })).toBeVisible();
  await page.getByRole("link", { name: "Pilih skenario untuk perbandingan" }).click();
  const choices = page.locator(".scenario-choice input[type=checkbox]:not(:disabled)");
  await expect(choices.first()).toBeVisible();
  await choices.nth(0).check();
  await choices.nth(1).check();
  await page.getByRole("button", { name: "Bandingkan pilihan" }).click();
  await expect(page.locator(".comparison table")).toBeVisible();
  await page.getByRole("button", { name: "Buat laporan tersimpan" }).click();
  await expect(page).toHaveURL(/\/reports\/[^/?]+\?company=/);
  await expect(page.locator("pre.memo")).toContainText("SIMULATION");
  const reportUrl = page.url();
  const content = await page.locator("pre.memo").textContent();
  await page.reload();
  await expect(page.locator("pre.memo")).toHaveText(content!);
  expect(page.url()).toBe(reportUrl);
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto(reportUrl);
  await expect(page).toHaveURL(/\/login$/);
});

test("scenario field validation and narrow viewport remain usable", async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".company-card").first().getByRole("link", { name: "Buka perusahaan" }).click();
  await page.locator("nav").getByRole("link", { name: "Buat skenario", exact: true }).click();
  await page.getByLabel("Alokasi saham A").fill("abc");
  await page.getByRole("button", { name: "Hitung dan simpan skenario" }).click();
  await expect(page.locator("#shares-0-error")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.locator(".skip-link").focus();
  await expect(page.locator(".skip-link")).toBeVisible();
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});

test("viewer role has read-only access and can inspect audit trail", async ({ page }) => {
  await page.goto("/login");
  // Quick pick viewer
  await page.getByRole("button", { name: /Auditor/ }).click();
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.getByText("Auditor / Pemirsa")).toBeVisible();

  // Audit trail link is visible in sidebar
  await page.getByRole("link", { name: "Jejak Audit" }).click();
  await expect(page).toHaveURL(/\/audit$/);
  await expect(page.getByRole("heading", { name: /Rekaman Jejak Audit/ })).toBeVisible();
  await expect(page.locator("table")).toBeVisible();

  // Team management is NOT in sidebar
  await expect(page.locator("nav").getByRole("link", { name: "Tim & Pengguna" })).toHaveCount(0);

  // Go to company ledger
  await page.goto("/workspace");
  await page.locator(".company-card").first().getByRole("link", { name: "Buka perusahaan" }).click();
  await page.getByRole("link", { name: "Tinjau ledger", exact: true }).click();
  await expect(page.getByText(/Mode Pemirsa \/ Auditor Eksternal/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Buat revisi draft" })).toHaveCount(0);

  // Go to scenario
  await page.locator("nav").getByRole("link", { name: "Buat skenario", exact: true }).click();
  await expect(page.getByText("Mode Pemirsa (Read-Only)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Hitung dan simpan skenario" })).toBeDisabled();
});

test("admin role can manage workspace users and view RBAC matrix", async ({ page }) => {
  await page.goto("/login");
  // Quick pick admin
  await page.getByRole("button", { name: /Admin/ }).click();
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.getByText("Admin Workspace")).toBeVisible();

  // Navigate to Team Management
  await page.getByRole("link", { name: "Tim & Pengguna" }).click();
  await expect(page).toHaveURL(/\/team$/);
  await expect(page.getByRole("heading", { name: "Manajemen Tim & Otorisasi" })).toBeVisible();

  // Verify users table and RBAC matrix are visible
  await expect(page.getByRole("heading", { name: "Daftar Pengguna Workspace" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tambah Pengguna Baru" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Matriks Otorisasi Peran/ })).toBeVisible();

  // Verify all 4 default roles appear in the table
  const userTable = page.locator("table").first();
  await expect(userTable.getByText("@admin")).toBeVisible();
  await expect(userTable.getByText("@reviewer")).toBeVisible();
  await expect(userTable.getByText("@analyst")).toBeVisible();
  await expect(userTable.getByText("@viewer")).toBeVisible();
});
