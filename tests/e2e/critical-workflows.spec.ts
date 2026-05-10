import { expect, test } from "@playwright/test";
import { login, resolveE2EAdminCredentials, resolveE2EUserCredentials } from "./e2eAuth";

const userCredentials = resolveE2EUserCredentials();
const adminCredentials = resolveE2EAdminCredentials();

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
  test.skip(!userCredentials, "Set E2E_USER_EMAIL and E2E_USER_PASSWORD to run authenticated E2E checks.");

  test("user login, protected upload surface, and logout", async ({ page }) => {
    await login(page, userCredentials!);
    await page.goto("/upload");
    await expect(page.locator("body")).toContainText(/upload/i);
    await page.getByRole("button", { name: /logout|log out|sign out/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("admin critical workflow scaffold", () => {
  test.skip(!adminCredentials, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run admin E2E checks.");

  test("admin can open lifecycle and correction surfaces", async ({ page }) => {
    await login(page, adminCredentials!);
    await page.goto("/admin-mock-lifecycle");
    await expect(page.locator("body")).toContainText(/lifecycle/i);
    await page.goto("/admin-parser-testing");
    await expect(page.locator("body")).toContainText(/parser/i);
  });
});
