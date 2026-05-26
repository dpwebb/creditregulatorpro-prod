import { expect, test, type Page } from "@playwright/test";
import { login, resolveE2EAdminCredentials } from "./e2eAuth";

const adminCredentials = resolveE2EAdminCredentials();

async function openSecurityPage(page: Page) {
  await login(page, adminCredentials!);
  await page.goto("/admin-security", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Security & Compliance" })).toBeVisible();
}

async function findFailedLoginAuditLogId(page: Page, email: string): Promise<number | null> {
  return page.evaluate(async (targetEmail) => {
    const response = await fetch("/_api/admin/audit-logs?actionType=LOGIN_FAILED&status=FAILURE&limit=200");
    if (!response.ok) {
      throw new Error(await response.text());
    }

    const payload = await response.json();
    const matchingLog = payload.logs?.find((log: { id?: number; details?: unknown }) => {
      const details = log.details;
      return (
        details &&
        typeof details === "object" &&
        "email" in details &&
        (details as { email?: unknown }).email === targetEmail
      );
    });

    return typeof matchingLog?.id === "number" ? matchingLog.id : null;
  }, email);
}

test.describe("Security & Compliance admin functions", () => {
  test.skip(!adminCredentials, "Set E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD for non-local admin security E2E checks.");

  test("confirms audit log filters, pagination, and details dialog", async ({ page }) => {
    await openSecurityPage(page);

    await expect(page.getByRole("tab", { name: /Audit Logs/i })).toBeVisible();
    await expect(page.getByLabel("Action Type")).toBeVisible();
    await expect(page.getByLabel("Entity Type")).toBeVisible();
    await expect(page.getByLabel("Status")).toBeVisible();
    await expect(page.getByLabel("Error Severity")).toBeVisible();
    await expect(page.getByLabel("Start Date")).toBeVisible();
    await expect(page.getByLabel("End Date")).toBeVisible();
    await expect(page.getByLabel("User Email")).toBeVisible();
    await expect(page.getByLabel("User ID")).toBeVisible();

    const nextButton = page.getByRole("button", { name: "Next" });
    if (await nextButton.isEnabled()) {
      await nextButton.click();
      await expect(page.getByRole("button", { name: "Previous" })).toBeEnabled();
      await page.getByRole("button", { name: "Previous" }).click();
    }

    const failedLoginEmail = `admin-clickthrough-${Date.now()}@example.invalid`;
    await page.evaluate(async (email) => {
      await fetch("/_api/auth/login_with_password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "intentionally-invalid-password" }),
      });
    }, failedLoginEmail);

    await page.evaluate(async () => {
      const response = await fetch("/_api/admin/retention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmDelete: false }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
    });

    let failedLoginLogId: number | null = null;
    await expect
      .poll(async () => {
        failedLoginLogId = await findFailedLoginAuditLogId(page, failedLoginEmail);
        return failedLoginLogId === null ? "missing" : "found";
      }, { timeout: 15000 })
      .toBe("found");

    await page.getByLabel("Action Type").selectOption("LOGIN_FAILED");
    await page.getByLabel("Status").selectOption("FAILURE");
    await expect(page.locator("tbody")).toContainText("Login Failed", { timeout: 15000 });
    await expect(page.locator("tbody")).toContainText("FAILURE");

    await page.getByLabel("Error Severity").selectOption("HIGH");
    await expect(page.locator("body")).toBeVisible();
    await page.getByLabel("Error Severity").selectOption("");

    await page.getByRole("button", { name: `View details for audit log ${failedLoginLogId}` }).click();
    const detailsDialog = page.getByRole("dialog", { name: "Log Details" });
    await expect(detailsDialog).toBeVisible();
    await expect(detailsDialog).toContainText(failedLoginEmail);
    await detailsDialog.getByRole("button", { name: "Close" }).filter({ hasText: "Close" }).click();
  });

  test("confirms data retention stats, automation, confirmation, and enforcement", async ({ page }) => {
    await openSecurityPage(page);
    await page.getByRole("tab", { name: /Data Retention/i }).click();

    await expect(page.getByRole("heading", { name: "Data Retention Policy" })).toBeVisible();
    await expect(page.getByText("Eligible for Deletion")).toBeVisible();
    await expect(page.getByText("Data Breakdown")).toBeVisible();
    await expect(page.getByText("Automated Enforcement")).toBeVisible();

    await page.evaluate(() => {
      (window as any).__copiedRetentionWebhook = "";
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            (window as any).__copiedRetentionWebhook = text;
          },
        },
      });
    });
    await page.getByRole("button", { name: "Copy retention webhook URL" }).click();
    await expect
      .poll(() => page.evaluate(() => (window as any).__copiedRetentionWebhook))
      .toContain("/_api/retention/auto-purge");

    await page.getByRole("button", { name: "Setup Instructions" }).click();
    await expect(page.getByText("Prepare Authentication")).toBeVisible();
    await expect(page.getByText("Configure Scheduler")).toBeVisible();

    await page.getByRole("button", { name: /Run Manual Enforcement/i }).click();
    await expect(page.getByRole("dialog", { name: "Confirm Data Deletion" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm & Delete" })).toBeDisabled();
    await page.getByLabel("I confirm deletion of data older than 1 year").check();
    await expect(page.getByRole("button", { name: "Confirm & Delete" })).toBeEnabled();
    await page.getByRole("button", { name: "Confirm & Delete" }).click();

    await expect(page.getByText("Retention enforcement completed successfully")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Deleted undefined records/i)).toHaveCount(0);
  });

  test("confirms semantic audit full run, specific-user run, and export", async ({ page }) => {
    await openSecurityPage(page);
    await page.getByRole("tab", { name: /Semantic Audit/i }).click();

    await page.getByRole("button", { name: "Run Full Audit" }).click();
    await expect(page.getByText("Total Checks")).toBeVisible({ timeout: 60000 });
    await expect(page.getByText("Passed", { exact: true })).toBeVisible();
    await expect(page.getByText("Failed", { exact: true })).toBeVisible();

    const userId = await page.evaluate(async () => {
      const response = await fetch("/_api/admin/users?role=user&limit=1&offset=0");
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = await response.json();
      return payload.users?.[0]?.id as number | undefined;
    });

    if (userId) {
      await page.getByPlaceholder("User ID").fill(String(userId));
      await page.getByRole("button", { name: "Audit Specific User" }).click();
      await expect(page.getByText("Total Checks")).toBeVisible({ timeout: 60000 });
    }

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Export JSON/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("semantic-audit-report.json");
  });
});
