import { test, expect } from "@playwright/test";

// ponytail: smoke tests require a running backend (uvicorn) for full flow.
// When backend is unavailable, tests verify the frontend renders with error handling.
// Main agent runs these after engine + API are ready.

const DEMO_URL = "/demo";

test.describe("FloatPath demo smoke tests", () => {
  test("01 — redirect / → /demo", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/demo/);
  });

  test("02 — /demo renders SIMULATION_ONLY banner and company cards or error", async ({ page }) => {
    await page.goto(DEMO_URL);
    await expect(page.getByText("SIMULATION_ONLY")).toBeVisible();
    // If API is running, company cards appear; otherwise, the error box with retry is shown
    const cards = page.locator(".company-card");
    const errorBox = page.locator(".error-box");
    await expect(cards.first().or(errorBox)).toBeVisible({ timeout: 15000 });
  });

  test("03 — sidebar navigation renders all 7 screens", async ({ page }) => {
    await page.goto(DEMO_URL);
    for (const label of [
      "Ruang demo",
      "Ringkasan perusahaan",
      "Tinjau data kepemilikan",
      "Asesmen numerik",
      "Buat skenario",
      "Bandingkan skenario",
      "Memo & bukti",
    ]) {
      await expect(page.getByText(label).first()).toBeVisible();
    }
  });

  test("04 — skip link is accessible", async ({ page }) => {
    await page.goto(DEMO_URL);
    const skipLink = page.locator(".skip-link");
    await expect(skipLink).toHaveAttribute("href", "#main");
    // The skip link becomes visible on focus
    await skipLink.focus();
    await expect(skipLink).toBeVisible();
  });

  test("05 — /demo DEMO pill is shown", async ({ page }) => {
    await page.goto(DEMO_URL);
    await expect(page.getByText("DEMO · READ ONLY")).toBeVisible();
  });
});

test.describe("Full demo flow (requires running backend)", () => {
  test.beforeAll(async ({ request }) => {
    // Check if backend is available, skip if not
    try {
      const response = await request.get("/api/v1/demo/companies");
      if (!response.ok()) {
        test.skip(true, "Backend API not available — skipping integration tests");
      }
    } catch {
      test.skip(true, "Backend API unreachable — skipping integration tests");
    }
  });

  test("06 — full flow: demo → company → ledger → assessment → scenario → compare → report", async ({
    page,
  }) => {
    // Step 1: Demo page — select first company
    await page.goto(DEMO_URL);
    const firstCard = page.locator(".company-card").first();
    await expect(firstCard).toBeVisible({ timeout: 15000 });
    const companyLink = firstCard.locator("a.card-link");
    await companyLink.click();

    // Step 2: Company overview — check metrics and navigate to ledger
    await expect(page).toHaveURL(/\/companies\//);
    await expect(page.getByText("Total saham", { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Rasio free float", { exact: true })).toBeVisible();
    await page.getByText("Tinjau ledger").click();

    // Step 3: Verify / Ledger
    await expect(page).toHaveURL(/\/snapshots\//);
    await expect(page.getByText("Ledger & bukti sumber")).toBeVisible({ timeout: 10000 });
    const table = page.locator("table");
    await expect(table).toBeVisible();
    // Check ledger has holders
    const rows = table.locator("tbody tr");
    await expect(rows.first()).toBeVisible();
    await page.getByText("Lanjut ke asesmen").click();

    // Step 4: Assessment
    await expect(page).toHaveURL(/\/assessments\//);
    await expect(page.getByText("SIMULATION_ONLY").first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Target profil demo")).toBeVisible();
    await page.locator("a.button:has-text('Buat skenario')").click();

    // Step 5: Scenario — submit with preset values
    await expect(page).toHaveURL(/\/scenarios\/new/);
    await expect(page.getByText("Input skenario")).toBeVisible({ timeout: 10000 });
    // Use transfer preset
    await page.getByText("Transfer 2 × 25 juta").click();
    await page.getByText("Hitung skenario").click();

    // Wait for result
    const resultHeading = page.getByText("Hasil skenario dari mesin");
    await expect(resultHeading).toBeVisible({ timeout: 30000 });
    // Check hash is present
    await expect(page.getByText("Hash hasil").first()).toBeVisible();

    // Navigate to compare
    await page.getByText("Bandingkan skenario").first().click();

    // Step 6: Compare
    await expect(page).toHaveURL(/\/scenarios\/compare/);
    const compareTable = page.locator(".comparison table");
    await expect(compareTable).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole("columnheader", { name: /Baseline/ })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /Skenario A/ })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /Skenario B/ })).toBeVisible();

    // Navigate to report
    await page.getByText("Buat memo berbukti").click();

    // Step 7: Report
    await expect(page).toHaveURL(/\/reports\//);
    await expect(page.getByText("Pratinjau memo")).toBeVisible({ timeout: 30000 });
    const memo = page.locator("pre.memo");
    await expect(memo).toBeVisible();
    const memoText = await memo.textContent();
    expect(memoText).toBeTruthy();
    expect(memoText!.length).toBeGreaterThan(50);
    // Download button should be present
    await expect(page.getByText("Unduh Markdown")).toBeVisible();
    // Source references panel
    await expect(page.getByText("Referensi sumber dari API")).toBeVisible();
  });

  test("07 — API error display on invalid scenario", async ({ page }) => {
    await page.goto(DEMO_URL);
    const firstCard = page.locator(".company-card").first();
    await expect(firstCard).toBeVisible({ timeout: 15000 });
    const companyLink = firstCard.locator("a.card-link");
    await companyLink.click();
    await expect(page).toHaveURL(/\/companies\//);

    // Go to scenario
    const scenarioLink = page.locator('nav a:has-text("Buat skenario")');
    await scenarioLink.click();
    await expect(page).toHaveURL(/\/scenarios\/new/);

    // Try submitting with invalid shares (letters)
    const sharesInput = page.locator("#shares-0");
    await sharesInput.fill("abc");
    await page.getByText("Hitung skenario").click();

    // Field error should appear
    const fieldError = page.locator(".field-error").first();
    await expect(fieldError).toBeVisible();
  });
});
