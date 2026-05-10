import { expect, test, type Page } from "@playwright/test";
import { ADMIN_SIDEBAR_ROUTES } from "../../helpers/adminSidebarRoutes";
import { login, resolveE2EAdminCredentials } from "./e2eAuth";

const adminCredentials = resolveE2EAdminCredentials();

function routePattern(path: string): RegExp {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}(?:[?#].*)?$`);
}

async function assertNoAdminRouteFailures(page: Page, routeLabel: string, apiFailures: string[]) {
  await expect(page.locator("body")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/Access Denied|Not Found|Admin privileges required|Unauthorized/i);
  await expect(page.getByRole("link", { name: routeLabel }).first()).toBeVisible();
  await page.waitForTimeout(500);
  expect(apiFailures, `API failures while loading ${routeLabel}`).toEqual([]);
}

test.describe("admin sidebar route coverage", () => {
  test.skip(!adminCredentials, "Set E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD for non-local admin route E2E checks.");

  test("seeded admin can load every admin sidebar route", async ({ page }) => {
    test.setTimeout(180000);

    const apiFailures: string[] = [];
    const pageErrors: string[] = [];

    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    page.on("response", (response) => {
      const url = response.url();
      const status = response.status();
      if (!url.includes("/_api/")) {
        return;
      }
      if (status >= 500 || status === 401 || status === 403) {
        apiFailures.push(`${status} ${url}`);
      }
    });

    await login(page, adminCredentials!);

    for (const route of ADMIN_SIDEBAR_ROUTES) {
      apiFailures.length = 0;
      pageErrors.length = 0;

      await page.goto(route.path, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(routePattern(route.path));
      await assertNoAdminRouteFailures(page, route.label, apiFailures);
      expect(pageErrors, `Runtime errors while loading ${route.label}`).toEqual([]);
    }
  });
});
