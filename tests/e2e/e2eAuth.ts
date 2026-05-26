import { type Page } from "@playwright/test";
import { isLocalhostUrl, resolveLocalAdminAuth, type LocalAdminAuth } from "../../scripts/localAdminAuth";

export const E2E_BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5175";

export type E2ECredentials = {
  email: string;
  password: string;
};

export function resolveE2EAdminCredentials(): E2ECredentials | null {
  const stagingCredentials =
    process.env.STAGING_ADMIN_EMAIL && process.env.STAGING_ADMIN_PASSWORD
      ? {
          email: process.env.STAGING_ADMIN_EMAIL,
          password: process.env.STAGING_ADMIN_PASSWORD,
        }
      : null;

  if (!isLocalhostUrl(E2E_BASE_URL) && stagingCredentials) {
    return stagingCredentials;
  }

  if (process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD) {
    return {
      email: process.env.E2E_ADMIN_EMAIL,
      password: process.env.E2E_ADMIN_PASSWORD,
    };
  }

  if (stagingCredentials) return stagingCredentials;

  if (!isLocalhostUrl(E2E_BASE_URL)) {
    return null;
  }

  const localAdmin: LocalAdminAuth = resolveLocalAdminAuth(process.env);
  return {
    email: localAdmin.email,
    password: localAdmin.password,
  };
}

export function resolveE2EUserCredentials(): E2ECredentials | null {
  if (!process.env.E2E_USER_EMAIL || !process.env.E2E_USER_PASSWORD) {
    return null;
  }

  return {
    email: process.env.E2E_USER_EMAIL,
    password: process.env.E2E_USER_PASSWORD,
  };
}

export async function login(page: Page, credentials: E2ECredentials) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(credentials.email);
  await page.getByLabel(/password/i).fill(credentials.password);
  await page.getByRole("button", { name: /log in|login/i }).click();

  const outcome = await Promise.race([
    page.waitForURL((url) => !/\/login$/.test(url.pathname), { timeout: 10000 }).then(() => "navigated" as const),
    page.getByText(/invalid email or password/i).waitFor({ state: "visible", timeout: 10000 }).then(() => "invalid" as const),
  ]).catch(() => "timeout" as const);

  if (outcome !== "navigated") {
    await page.getByLabel(/password/i).fill("");
    await page.getByLabel(/email/i).fill("");
    throw new Error(`Login failed for ${credentials.email}. Verify the E2E credentials and E2E_BASE_URL target.`);
  }
}
