export type AdminResetSafetyResult =
  | {
      ok: true;
      databaseName: string;
      host: string;
    }
  | {
      ok: false;
      reason: string;
    };

type ResetSafetyEnv = Partial<Record<
  "CRP_LOCAL_DEV" | "CRP_ENV" | "NODE_ENV" | "FLOOT_DATABASE_URL" | "LOCAL_DATABASE_NAME",
  string | undefined
>>;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function normalized(value: string | undefined): string {
  return (value ?? "").trim();
}

function isProductionLikeDatabaseName(databaseName: string): boolean {
  return /(^|[_-])(prod|production)([_-]|$)|creditregulatorpro[-_]?prod/i.test(databaseName);
}

function isUnsafeRuntimeEnvironment(env: ResetSafetyEnv): boolean {
  const crpEnv = normalized(env.CRP_ENV).toLowerCase();
  const nodeEnv = normalized(env.NODE_ENV).toLowerCase();
  return crpEnv === "production" || crpEnv === "prod" || crpEnv === "staging" || nodeEnv === "production";
}

export function validateAdminResetEnvironment(env: ResetSafetyEnv = process.env): AdminResetSafetyResult {
  if (normalized(env.CRP_LOCAL_DEV) !== "true") {
    return { ok: false, reason: "Reset-user is limited to explicit local development environments." };
  }

  if (isUnsafeRuntimeEnvironment(env)) {
    return { ok: false, reason: "Reset-user is blocked for staging or production runtime environments." };
  }

  const databaseUrl = normalized(env.FLOOT_DATABASE_URL);
  if (!databaseUrl) {
    return { ok: false, reason: "Reset-user cannot classify the database target." };
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return { ok: false, reason: "Reset-user database target is invalid." };
  }

  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    return { ok: false, reason: "Reset-user refuses non-local database hosts." };
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, "")).trim();
  if (!databaseName) {
    return { ok: false, reason: "Reset-user database name is missing." };
  }

  if (isProductionLikeDatabaseName(databaseName)) {
    return { ok: false, reason: "Reset-user refuses production-looking database names." };
  }

  const expectedLocalDatabase = normalized(env.LOCAL_DATABASE_NAME);
  if (expectedLocalDatabase && expectedLocalDatabase !== databaseName) {
    return { ok: false, reason: "Reset-user database does not match LOCAL_DATABASE_NAME." };
  }

  return {
    ok: true,
    databaseName,
    host: parsed.hostname,
  };
}
