import { expect, type Page, test } from "@playwright/test";

const userEmail = process.env.E2E_USER_EMAIL;
const userPassword = process.env.E2E_USER_PASSWORD;
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /log in|login/i }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

test.describe("public route smoke", () => {
  for (const route of ["/", "/login", "/register", "/try-upload", "/reset-password"]) {
    test(`loads ${route}`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("body")).toBeVisible();
      await expect(page.locator("body")).not.toContainText("Not Found");
    });
  }
});

test.describe("authenticated critical workflow scaffold", () => {
  test.skip(!userEmail || !userPassword, "Set E2E_USER_EMAIL and E2E_USER_PASSWORD to run authenticated E2E checks.");

  test("user login, protected upload surface, and logout", async ({ page }) => {
    await login(page, userEmail!, userPassword!);
    await page.goto("/upload");
    await expect(page.locator("body")).toContainText(/upload/i);
    await page.getByRole("button", { name: /logout|log out|sign out/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("admin critical workflow scaffold", () => {
  test.skip(!adminEmail || !adminPassword, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run admin E2E checks.");

  test("admin can open lifecycle and correction surfaces", async ({ page }) => {
    await login(page, adminEmail!, adminPassword!);
    await page.goto("/admin-mock-lifecycle");
    await expect(page.locator("body")).toContainText(/lifecycle/i);
    await page.goto("/admin-parser-testing");
    await expect(page.locator("body")).toContainText(/parser/i);
  });
});
