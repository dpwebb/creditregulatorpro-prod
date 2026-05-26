import { fileURLToPath } from "node:url";

import {
  ApiClient,
  AUTH_WORKFLOW_ENDPOINTS,
  redactSecretText,
  SKIPPED_EXIT_CODE,
} from "./staging-auth-workflow-smoke";
import { resolveAdminAuthInputs } from "./e2e-operational-audit";

const DEFAULT_STAGING_BASE_URL = "https://staging.creditregulatorpro.com";
const ALLOWED_HOSTS = new Set(["staging.creditregulatorpro.com", "localhost", "127.0.0.1"]);
const REFUSED_HOSTS = new Set(["creditregulatorpro.com", "www.creditregulatorpro.com"]);

type AdminAuthAuditStatus = "PASS" | "INCOMPLETE" | "FAIL_AUTH" | "FAIL";

type AdminAuthReport = {
  audit: "CreditRegulatorPro Admin Auth Diagnostic";
  status: AdminAuthAuditStatus;
  code: string;
  generatedAt: string;
  baseUrl: string;
  authMode: "credentials" | "session_cookie" | "missing" | null;
  adminAccountExists: boolean | "unknown";
  adminRoleVerified: boolean;
  sessionUser?: {
    id: number | null;
    email: string | null;
    role: string | null;
  };
  reason: string;
  safeNextSteps: string[];
  safety: {
    passwordPrinted: false;
    sessionCookiePrinted: false;
    secretsPrinted: false;
  };
};

type SessionResponse =
  | {
      user: {
        id?: number;
        email?: string;
        role?: string;
      };
    }
  | {
      error: string;
    };

function normalizeEnv(value: string | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function valueAfter(argv: string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  return index >= 0 ? normalizeEnv(argv[index + 1]) : null;
}

function resolveBaseUrl(env: NodeJS.ProcessEnv, argv: string[]): string {
  return (
    valueAfter(argv, "--base-url") ??
    normalizeEnv(env.STAGING_BASE_URL) ??
    normalizeEnv(env.STAGING_APP_URL) ??
    normalizeEnv(env.E2E_BASE_URL) ??
    DEFAULT_STAGING_BASE_URL
  );
}

function validateBaseUrl(baseUrl: string): URL {
  const parsed = new URL(baseUrl);
  if (REFUSED_HOSTS.has(parsed.hostname)) {
    throw new Error(`Refusing to run admin auth diagnostics against production host ${parsed.hostname}.`);
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error(`Refusing unapproved admin auth diagnostic host ${parsed.hostname}.`);
  }
  return parsed;
}

function extractErrorMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: string; message?: string };
    return parsed.error ?? parsed.message ?? raw;
  } catch {
    return raw;
  }
}

export function classifyAdminAuthFailure(mode: "credentials" | "session_cookie", httpStatus: number, message: string): string {
  if (mode === "credentials" && (httpStatus === 401 || httpStatus === 403)) return "ADMIN_PASSWORD_LOGIN_REJECTED";
  if (mode === "session_cookie" && (httpStatus === 401 || httpStatus === 403)) return "ADMIN_SESSION_COOKIE_REJECTED";
  if (/role/i.test(message)) return "ADMIN_ROLE_NOT_ALLOWED";
  if (/session/i.test(message)) return "ADMIN_SESSION_NOT_ESTABLISHED";
  return "ADMIN_AUTH_DIAGNOSTIC_FAILED";
}

function report(
  status: AdminAuthAuditStatus,
  code: string,
  baseUrl: string,
  authMode: AdminAuthReport["authMode"],
  reason: string,
  overrides: Partial<AdminAuthReport> = {},
): AdminAuthReport {
  return {
    audit: "CreditRegulatorPro Admin Auth Diagnostic",
    status,
    code,
    generatedAt: new Date().toISOString(),
    baseUrl,
    authMode,
    adminAccountExists: "unknown",
    adminRoleVerified: false,
    reason,
    safeNextSteps: [
      'Use STAGING_ADMIN_EMAIL/STAGING_ADMIN_PASSWORD for password auth diagnostics.',
      'Use STAGING_ADMIN_SESSION_COOKIE when password login is blocked but a valid admin browser session exists.',
      'Run pnpm audit:e2e --require-admin after this diagnostic reports PASS.',
    ],
    safety: {
      passwordPrinted: false,
      sessionCookiePrinted: false,
      secretsPrinted: false,
    },
    ...overrides,
  };
}

export async function runAdminAuthAudit(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv.slice(2),
): Promise<AdminAuthReport> {
  const baseUrl = resolveBaseUrl(env, argv);
  const parsed = validateBaseUrl(baseUrl);
  const auth = resolveAdminAuthInputs(env, parsed.hostname);

  if (auth.status === "missing") {
    return report("INCOMPLETE", "ADMIN_AUTH_INPUTS_MISSING", baseUrl, "missing", auth.reason);
  }

  const api = new ApiClient(baseUrl, baseUrl);
  if (auth.mode === "session_cookie") {
    api.setCookieHeader(auth.sessionCookie ?? "");
  } else {
    const login = await api.request(AUTH_WORKFLOW_ENDPOINTS.login, {
      method: "POST",
      body: {
        email: auth.email,
        password: auth.password,
      },
    });

    if (!login.ok) {
      const reason = redactSecretText(
        `Admin password login was rejected with HTTP ${login.status}: ${extractErrorMessage(login.raw)}`,
        env,
      );
      return report("FAIL_AUTH", classifyAdminAuthFailure("credentials", login.status, reason), baseUrl, "credentials", reason, {
        adminAccountExists: login.status === 401 || login.status === 403 ? "unknown" : false,
      });
    }
  }

  const session = await api.request(AUTH_WORKFLOW_ENDPOINTS.session);
  if (!session.ok) {
    const mode = auth.mode;
    const reason = redactSecretText(
      `Admin session check failed with HTTP ${session.status}: ${extractErrorMessage(session.raw)}`,
      env,
    );
    return report("FAIL_AUTH", classifyAdminAuthFailure(mode, session.status, reason), baseUrl, mode, reason);
  }

  const sessionJson = session.json as SessionResponse | null;
  const user = sessionJson && "user" in sessionJson ? sessionJson.user : null;
  const role = user?.role ?? null;
  const roleVerified = role === "admin" || role === "super_admin";
  if (!user || !roleVerified) {
    const reason = user
      ? `Configured admin auth resolved to role ${role ?? "unknown"}, not admin or super_admin.`
      : "Admin authentication did not produce a user session.";
    return report("FAIL_AUTH", classifyAdminAuthFailure(auth.mode, session.status, reason), baseUrl, auth.mode, reason, {
      adminAccountExists: Boolean(user),
      sessionUser: {
        id: user?.id ?? null,
        email: user?.email ?? null,
        role,
      },
    });
  }

  return report("PASS", "ADMIN_AUTH_VERIFIED", baseUrl, auth.mode, "Admin account exists, authenticated successfully, and resolved to an admin role.", {
    adminAccountExists: true,
    adminRoleVerified: true,
    sessionUser: {
      id: user.id ?? null,
      email: user.email ?? null,
      role,
    },
  });
}

function printReport(output: AdminAuthReport) {
  console.log(JSON.stringify(output, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runAdminAuthAudit()
    .then((output) => {
      printReport(output);
      process.exitCode = output.status === "PASS" ? 0 : output.status === "INCOMPLETE" ? SKIPPED_EXIT_CODE : 1;
    })
    .catch((error) => {
      const baseUrl = resolveBaseUrl(process.env, process.argv.slice(2));
      printReport(
        report(
          "FAIL",
          "ADMIN_AUTH_DIAGNOSTIC_ERROR",
          baseUrl,
          null,
          redactSecretText(error instanceof Error ? error.message : String(error), process.env),
        ),
      );
      process.exitCode = 1;
    });
}
