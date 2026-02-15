import { test, expect } from "@playwright/test";

const hasOwnerCreds = !!process.env.E2E_EMAIL && !!process.env.E2E_PASSWORD;
const hasAdminCreds = !!process.env.E2E_ADMIN_EMAIL && !!process.env.E2E_ADMIN_PASSWORD;

test.describe("Smoke", () => {
  test("boots to auth", async ({ page, baseURL }) => {
    await page.goto(new URL("/auth", baseURL).toString(), { waitUntil: "domcontentloaded" });
    // Minimal signal: should render some auth UI and not a 404.
    await expect(page.locator("body")).toContainText(/sign in|login|password/i);
  });

  test("owner login and dashboard", async ({ page, baseURL }) => {
    test.skip(!hasOwnerCreds, "E2E owner credentials not configured");
    const email = process.env.E2E_EMAIL!;
    const password = process.env.E2E_PASSWORD!;

    await page.goto(new URL("/auth", baseURL).toString(), { waitUntil: "domcontentloaded" });
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);

    // Button text varies; click the first reasonable submit.
    const submit = page.getByRole("button", { name: /sign in|login/i });
    await submit.click();

    // App should route somewhere protected (often owner vehicles).
    await page.waitForURL(/\/owner\/vehicles|\/redirect|\/admin\/dashboard|\/partner\/dashboard/i, { timeout: 30_000 });
    await expect(page.locator("body")).not.toContainText(/404 Error/i);
  });

  test("admin login and dashboard", async ({ page, baseURL }) => {
    test.skip(!hasAdminCreds, "E2E admin credentials not configured");
    const email = process.env.E2E_ADMIN_EMAIL!;
    const password = process.env.E2E_ADMIN_PASSWORD!;

    await page.goto(new URL("/auth", baseURL).toString(), { waitUntil: "domcontentloaded" });
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole("button", { name: /sign in|login/i }).click();

    await page.waitForURL(/\/admin\/dashboard|\/redirect/i, { timeout: 30_000 });
    await expect(page.locator("body")).not.toContainText(/access denied/i);
  });
});
