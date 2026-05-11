import { expect, test, type Page } from "@playwright/test";
import { login, resolveE2EAdminCredentials } from "./e2eAuth";

const adminCredentials = resolveE2EAdminCredentials();

const viewports = [
  { name: "iphone-se", width: 375, height: 667 },
  { name: "mobile-landscape", width: 667, height: 375 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "ultrawide", width: 2560, height: 1080 },
] as const;

const publicRoutes = ["/login", "/register", "/try-upload", "/reset-password"];

const authenticatedStaticRoutes = [
  "/",
  "/upload",
  "/bureaus",
  "/contact",
  "/my-info",
  "/packets",
  "/calendar",
  "/evidence",
  "/progress",
  "/statutes",
  "/my-accounts",
  "/user-manual",
  "/cases/review",
  "/admin-security",
  "/tradelines-tab",
  "/evidence-events",
  "/support-tickets",
  "/admin-error-logs",
  "/change-detection",
  "/compliance-audit",
  "/profile-settings",
  "/report-artifacts",
  "/deadline-calendar",
  "/metro2-compliance",
  "/bankruptcy-tracker",
  "/bureau-obligations",
  "/regulatory-updates",
  "/admin-activity-logs",
  "/analytics-dashboard",
  "/compliance-calendar",
  "/evidence-management",
  "/admin-knowledge-base",
  "/admin-parser-testing",
  "/creditor-obligations",
  "/creditor-validations",
  "/admin-parser-mappings",
  "/admin-user-management",
  "/collector-obligations",
  "/enforcement-mechanisms",
  "/admin-compliance-config",
  "/admin-version-management",
  "/identity-theft-protection",
  "/admin-mock-lifecycle",
  "/admin-ai-assist",
  "/admin-risk-triage",
];

async function waitForSettledPage(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 1500 }).catch(() => undefined);
}

async function assertNoDocumentOverflow(page: Page, route: string, viewportName: string) {
  const metrics = await page.evaluate(() => {
    const documentElement = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.ceil(Math.max(documentElement.scrollWidth, body?.scrollWidth ?? 0));
    const clientWidth = Math.ceil(documentElement.clientWidth);
    const offenders = Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const styles = window.getComputedStyle(element);

        return {
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === "string" ? element.className : "",
          id: element.id,
          right: Math.ceil(rect.right),
          left: Math.floor(rect.left),
          width: Math.ceil(rect.width),
          position: styles.position,
          overflowX: styles.overflowX,
        };
      })
      .filter((item) => item.width > 0 && item.right > window.innerWidth + 2)
      .slice(0, 8);

    return {
      scrollWidth,
      clientWidth,
      viewportWidth: window.innerWidth,
      offenders,
    };
  });

  expect(
    metrics.scrollWidth,
    `${route} overflowed on ${viewportName}: ${JSON.stringify(metrics)}`,
  ).toBeLessThanOrEqual(metrics.clientWidth + 2);
}

test.describe("responsive platform shell", () => {
  for (const viewport of viewports) {
    test(`public pages fit ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      for (const route of publicRoutes) {
        await page.goto(route);
        await waitForSettledPage(page);
        await assertNoDocumentOverflow(page, route, viewport.name);
      }
    });
  }

  test.describe("authenticated pages", () => {
    test.setTimeout(180000);
    test.skip(!adminCredentials, "Set E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD for non-local responsive E2E checks.");

    for (const viewport of viewports) {
      test(`authenticated static routes fit ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await login(page, adminCredentials!);

        for (const route of authenticatedStaticRoutes) {
          await page.goto(route);
          await waitForSettledPage(page);
          await assertNoDocumentOverflow(page, route, viewport.name);
        }
      });
    }

    test("mobile sidebar opens, closes, and stays in viewport", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await login(page, adminCredentials!);
      await page.goto("/");
      await waitForSettledPage(page);

      await page.getByRole("button", { name: "Open menu" }).click();
      await expect(page.locator("aside").first()).toBeVisible();
      await assertNoDocumentOverflow(page, "/", "mobile-sidebar-open");

      await page.keyboard.press("Escape");
      await assertNoDocumentOverflow(page, "/", "mobile-sidebar-closed");
    });
  });
});
