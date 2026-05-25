import { chromium, expect } from "@playwright/test";

export const ADMIN_PLATFORM_RESET_SMOKE_GATE_ENV = "CRP_ADMIN_PLATFORM_RESET_SMOKE";
export const ADMIN_PLATFORM_RESET_CONFIRMATION = "RESET STAGING PLATFORM";
export const SKIPPED_EXIT_CODE = 2;

type Session = {
  cookie: string;
  authMode: "credentials" | "session_cookie";
};

type PlatformResetDryRun = {
  success: boolean;
  result: {
    mode: string;
    resetScope: string;
    environment: { kind: string; reason: string };
    database: { source: string; host: string; port: string; database: string };
    preservedSubsystems: string[];
    preservedTables: string[];
    rowsByTable: Array<{ table?: string; count?: number; skipped?: boolean; action?: string }>;
    userPlan: {
      preservedCount: number;
      deletedCount: number;
      preservedUsers: Array<{ email: string; role?: string | null; reason: string }>;
      deletedUsers: Array<{ email: string; role?: string | null; reason: string }>;
    };
    storage?: {
      provider: { provider: string };
      references: {
        totalReferences: number;
        notFoundReferences: unknown[];
        unsupportedReferences: unknown[];
        failedReferences: unknown[];
      };
    };
    totalRowsMatched: number;
    validation: Array<{ name: string; status: string; detail?: string }>;
  };
};

function normalizeEnv(value: string | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toAbsoluteUrl(baseUrl: string, route: string): string {
  return new URL(route, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

function cookieHeaderFromSetCookie(setCookie: string): string {
  const normalized = setCookie.replace(/^cookie:\s*/i, "").trim();
  const match = normalized.match(/floot_built_app_session=[^;,\s]+/);
  return match?.[0] ?? "";
}

function sanitizeError(error: unknown): string {
  return String(error instanceof Error ? error.message : error)
    .replace(/floot_built_app_session=[^;,\s]+/gi, "floot_built_app_session=[REDACTED]")
    .replace(/postgres(?:ql)?:\/\/[^)\s"']+/gi, "postgres://[REDACTED]")
    .replace(/(password|token|authorization|cookie|apiKey|privateKey)=?[^,\s"']+/gi, "$1=[REDACTED]");
}

function skipped(reason: string): never {
  console.log(JSON.stringify({ status: "skipped", reason }, null, 2));
  process.exit(SKIPPED_EXIT_CODE);
}

async function loginWithCredentials(baseUrl: string, email: string, password: string): Promise<Session> {
  const response = await fetch(toAbsoluteUrl(baseUrl, "/_api/auth/login_with_password"), {
    method: "POST",
    body: JSON.stringify({ email, password }),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: baseUrl,
    },
  });
  if (!response.ok) {
    throw new Error(`Admin login failed with HTTP ${response.status}.`);
  }

  const cookie = cookieHeaderFromSetCookie(response.headers.get("set-cookie") ?? "");
  if (!cookie) {
    throw new Error("Admin login did not return a session cookie.");
  }

  return { cookie, authMode: "credentials" };
}

async function resolveSession(baseUrl: string): Promise<Session> {
  const configuredCookie = normalizeEnv(process.env.STAGING_ADMIN_SESSION_COOKIE);
  if (configuredCookie) {
    const cookie = cookieHeaderFromSetCookie(configuredCookie);
    if (!cookie) throw new Error("Configured admin session cookie did not include floot_built_app_session.");
    return { cookie, authMode: "session_cookie" };
  }

  const email = normalizeEnv(process.env.STAGING_ADMIN_EMAIL);
  const password = normalizeEnv(process.env.STAGING_ADMIN_PASSWORD);
  if (!email || !password) {
    skipped("STAGING_ADMIN_EMAIL/STAGING_ADMIN_PASSWORD or STAGING_ADMIN_SESSION_COOKIE is required.");
  }

  return loginWithCredentials(baseUrl, email, password);
}

async function assertAdminSession(baseUrl: string, cookie: string): Promise<string> {
  const response = await fetch(toAbsoluteUrl(baseUrl, "/_api/auth/session"), {
    headers: {
      Accept: "application/json",
      Cookie: cookie,
    },
  });
  if (!response.ok) throw new Error(`Admin session check failed with HTTP ${response.status}.`);

  const body = (await response.json()) as { user?: { role?: string } };
  const role = String(body.user?.role ?? "").toLowerCase();
  if (role !== "admin" && role !== "super_admin") {
    throw new Error(`Admin session resolved role ${role || "unknown"}.`);
  }
  return role;
}

async function postJson(baseUrl: string, route: string, cookie: string, body: unknown): Promise<Response> {
  return fetch(toAbsoluteUrl(baseUrl, route), {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: baseUrl,
      "x-crp-admin-platform-reset": "1",
    },
  });
}

function assertDryRunPayload(payload: PlatformResetDryRun): void {
  if (payload.success !== true) throw new Error("Platform reset dry-run did not report success.");
  if (payload.result.resetScope !== "hard") throw new Error(`Expected hard reset preview, got ${payload.result.resetScope}.`);
  if (payload.result.environment.kind === "production") {
    throw new Error("Staging platform reset smoke resolved production environment.");
  }
  if (!payload.result.database.host || !payload.result.database.database) {
    throw new Error("Platform reset dry-run did not report database host/name.");
  }
  if (payload.result.userPlan.preservedCount < 1) {
    throw new Error("Platform reset dry-run would leave no preserved admin/service users.");
  }
  if (!payload.result.rowsByTable.some((row) => row.table === "users")) {
    throw new Error("Hard reset preview did not include users table scope.");
  }
  for (const table of ["compliance_config", "support_ticket", "audit_log", "ai_assist_run", "report_artifact", "tradeline", "packet"]) {
    if (!payload.result.rowsByTable.some((row) => row.table === table || row.skipped)) {
      throw new Error(`Hard reset preview did not include ${table} table coverage.`);
    }
  }
  for (const table of ["dynamic_scanning_rule", "parser_field_mapping", "statute", "system_settings"]) {
    if (!payload.result.preservedTables.includes(table)) {
      throw new Error(`Platform reset preview did not preserve ${table}.`);
    }
  }
  if (!payload.result.storage?.provider?.provider) {
    throw new Error("Platform reset dry-run did not report storage provider.");
  }
}

async function verifyApi(baseUrl: string, cookie: string): Promise<PlatformResetDryRun> {
  const dryRun = await postJson(baseUrl, "/_api/admin/platform-reset/dry-run", cookie, { mode: "hard" });
  if (!dryRun.ok) {
    throw new Error(`Platform reset dry-run failed with HTTP ${dryRun.status}: ${await dryRun.text()}`);
  }

  const payload = (await dryRun.json()) as PlatformResetDryRun;
  assertDryRunPayload(payload);

  const badConfirm = await postJson(baseUrl, "/_api/admin/platform-reset/confirm", cookie, {
    mode: "hard",
    confirmation: "RESET PLATFORM",
    expectedDatabase: payload.result.database,
  });
  if (badConfirm.ok) {
    throw new Error("Platform reset confirm accepted an invalid confirmation phrase.");
  }
  if (![400, 422].includes(badConfirm.status)) {
    throw new Error(`Platform reset bad confirmation returned unexpected HTTP ${badConfirm.status}.`);
  }

  return payload;
}

async function verifyUi(baseUrl: string, cookie: string): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: baseUrl,
    extraHTTPHeaders: { Cookie: cookie },
  });
  const page = await context.newPage();

  try {
    await page.goto("/admin-security", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Security & Compliance" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("tab", { name: /Platform Reset/ }).click();
    await expect(page.getByRole("button", { name: "Reset Platform Test Data" })).toBeVisible();
    await expect(page.getByText("Reset staging or development operational data")).toBeVisible();
    await expect(page.getByLabel(/Hard/)).toBeChecked();

    await page.getByRole("button", { name: "Reset Platform Test Data" }).click();
    await expect(page.getByText("Affected tables")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText("Storage cleanup")).toBeVisible();
    await expect(page.getByText(`Type ${ADMIN_PLATFORM_RESET_CONFIRMATION} to enable confirmed reset.`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm Reset" })).toBeDisabled();
    await page.getByLabel(/Type RESET STAGING PLATFORM/).fill("RESET PLATFORM");
    await expect(page.getByRole("button", { name: "Confirm Reset" })).toBeDisabled();
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  if (normalizeEnv(process.env[ADMIN_PLATFORM_RESET_SMOKE_GATE_ENV]) !== "true") {
    skipped(`${ADMIN_PLATFORM_RESET_SMOKE_GATE_ENV}=true is required.`);
  }

  const baseUrl = normalizeEnv(process.env.STAGING_BASE_URL) ?? "https://staging.creditregulatorpro.com";
  const host = new URL(baseUrl).host;
  if (!/staging\.creditregulatorpro\.com$/i.test(host) && !/^localhost(?::\d+)?$/i.test(host)) {
    throw new Error(`Refusing admin platform reset smoke against unsupported host ${host}.`);
  }

  const session = await resolveSession(baseUrl);
  const role = await assertAdminSession(baseUrl, session.cookie);
  const apiPayload = await verifyApi(baseUrl, session.cookie);
  await verifyUi(baseUrl, session.cookie);

  console.log(
    JSON.stringify(
      {
        status: "passed",
        baseUrl,
        host,
        authMode: session.authMode,
        authenticatedRole: role,
        dryRun: {
          mode: apiPayload.result.resetScope,
          environment: apiPayload.result.environment.kind,
          databaseHost: apiPayload.result.database.host,
          databaseName: apiPayload.result.database.database,
          rowsMatched: apiPayload.result.totalRowsMatched,
          usersToDelete: apiPayload.result.userPlan.deletedCount,
          usersToPreserve: apiPayload.result.userPlan.preservedCount,
          storageProvider: apiPayload.result.storage?.provider.provider ?? "unknown",
          storageReferences: apiPayload.result.storage?.references.totalReferences ?? 0,
          storageReadFailedNotFound: apiPayload.result.storage?.references.notFoundReferences.length ?? 0,
        },
        confirmationProtection: "invalid confirmation phrase rejected",
        destructiveResetExecuted: false,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "failed", error: sanitizeError(error) }, null, 2));
  process.exit(1);
});
