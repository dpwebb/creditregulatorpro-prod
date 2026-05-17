import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import type { Kysely } from "kysely";

import type { DB, Json } from "../helpers/schema";

export const FIXTURE_SETUP_GATE_ENV = "CRP_OUTCOME_TRACKING_FIXTURE_SETUP";
export const FIXTURE_SETUP_SOURCE_ENV = "CRP_OUTCOME_TRACKING_FIXTURE_SOURCE";
export const SKIPPED_EXIT_CODE = 2;
export const FIXTURE_SETUP_CREATES_PACKET_FIXTURES = false;

export const ALLOWED_TARGETS = ["staging", "local"] as const;
export const ALLOWED_HOSTS = new Set(["staging.creditregulatorpro.com", "localhost", "127.0.0.1"]);
export const REFUSED_PRODUCTION_HOSTS = new Set(["creditregulatorpro.com", "www.creditregulatorpro.com"]);
export const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export const FORBIDDEN_FIXTURE_SETUP_ENDPOINTS = [
  { method: "POST", path: "/_api/parser/run" },
  { method: "POST", path: "/_api/parser-lab/run" },
  { method: "POST", path: "/_api/ocr/run" },
  { method: "POST", path: "/_api/ingest/process" },
  { method: "GET", path: "/_api/packet/readiness" },
  { method: "POST", path: "/_api/packet/build" },
  { method: "POST", path: "/_api/packet/create" },
  { method: "POST", path: "/_api/violations/run" },
  { method: "POST", path: "/_api/regulation-registry/runtime-bridge/activate" },
  { method: "POST", path: "/_api/regulation-registry/runtime-bridge/activate-limited-runtime" },
  { method: "POST", path: "/_api/admin/override" },
  { method: "POST", path: "/_api/furnisher/packet" },
] as const;

export const FIXTURE_CLEANUP_POSTURE =
  "Synthetic fixture rows intentionally remain for smoke/audit unless a future cleanup endpoint exists.";

type Target = (typeof ALLOWED_TARGETS)[number];
type Scenario = "corrected" | "unchanged";
type FixtureSource = "db" | "api";
type AuthMode = "credentials" | "session_cookie";
type AuthRole = "admin" | "user";

type ReadyFixtureSetupConfigBase = {
  status: "ready";
  source: FixtureSource;
  target: Target;
  baseUrl: string;
  host: string;
  outputPrefix: "STAGING" | "LOCAL_SMOKE";
  marker: string;
  scenario: Scenario;
};

export type FixtureSetupConfig =
  | (ReadyFixtureSetupConfigBase & {
      source: "db";
      databaseUrl: string;
      databaseUrlSource: string;
    })
  | (ReadyFixtureSetupConfigBase & {
      source: "api";
      authMode: AuthMode;
      authRole: AuthRole;
      sessionCookie?: string;
      email?: string;
      password?: string;
    })
  | {
      status: "skipped";
      reason: string;
    }
  | {
      status: "error";
      reason: string;
    };

export type SyntheticOutcomeFixtureRows = {
  marker: string;
  userId: number | null;
  bureauId: number | null;
  creditorId: number | null;
  previousReportArtifactId: number;
  laterReportArtifactId: number;
  previousTradelineId: number | null;
  laterTradelineId: number | null;
  expectedOutcomeTypes: string[];
};

function normalizeBoolean(value: string | undefined): boolean {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function normalizeEnv(value: string | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTarget(value: string | undefined): Target | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "staging" || normalized === "local" ? normalized : null;
}

function hostOf(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function dbParts(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function safeMarker(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function defaultMarker(): string {
  return `OUTCOME_SMOKE_${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;
}

export function markerIsSynthetic(value: string | null): value is string {
  return Boolean(value && /^OUTCOME_SMOKE_[A-Za-z0-9_-]+$/i.test(value));
}

function scenarioFromEnv(value: string | undefined): Scenario {
  return String(value ?? "").trim().toLowerCase() === "unchanged" ? "unchanged" : "corrected";
}

function sourceFromEnv(value: string | undefined): FixtureSource {
  return String(value ?? "").trim().toLowerCase() === "api" ? "api" : "db";
}

function prefixedEnv(env: NodeJS.ProcessEnv, prefix: "STAGING" | "LOCAL_SMOKE", key: string): string | undefined {
  return env[`${prefix}_${key}`];
}

function resolveAuthConfig(
  env: NodeJS.ProcessEnv,
  prefix: "STAGING" | "LOCAL_SMOKE",
): Pick<Extract<FixtureSetupConfig, { status: "ready"; source: "api" }>, "authMode" | "authRole" | "sessionCookie" | "email" | "password"> | null {
  const adminSessionCookie = normalizeEnv(prefixedEnv(env, prefix, "ADMIN_SESSION_COOKIE"));
  const userSessionCookie = normalizeEnv(prefixedEnv(env, prefix, "USER_SESSION_COOKIE"));
  const adminEmail = normalizeEnv(prefixedEnv(env, prefix, "ADMIN_EMAIL"));
  const adminPassword = normalizeEnv(prefixedEnv(env, prefix, "ADMIN_PASSWORD"));
  const userEmail = normalizeEnv(prefixedEnv(env, prefix, "USER_EMAIL"));
  const userPassword = normalizeEnv(prefixedEnv(env, prefix, "USER_PASSWORD"));

  if (adminSessionCookie || userSessionCookie) {
    return {
      authMode: "session_cookie",
      authRole: adminSessionCookie ? "admin" : "user",
      sessionCookie: adminSessionCookie ?? userSessionCookie ?? undefined,
    };
  }

  if (adminEmail && adminPassword) {
    return {
      authMode: "credentials",
      authRole: "admin",
      email: adminEmail,
      password: adminPassword,
    };
  }

  if (userEmail && userPassword) {
    return {
      authMode: "credentials",
      authRole: "user",
      email: userEmail,
      password: userPassword,
    };
  }

  return null;
}

export function validateFixtureHost(
  baseUrl: string,
  target: Target,
): { ok: true; host: string } | { ok: false; reason: string } {
  const host = hostOf(baseUrl);
  if (!host) return { ok: false, reason: "Invalid fixture setup base URL." };
  if (REFUSED_PRODUCTION_HOSTS.has(host)) {
    return { ok: false, reason: `Refusing to run against production host ${host}.` };
  }
  if (!ALLOWED_HOSTS.has(host)) {
    return { ok: false, reason: `Refusing to run against unapproved host ${host}.` };
  }
  if (target === "staging" && host !== "staging.creditregulatorpro.com") {
    return { ok: false, reason: `Staging fixture setup requires staging.creditregulatorpro.com, got ${host}.` };
  }
  if (target === "local" && !LOCAL_DB_HOSTS.has(host)) {
    return { ok: false, reason: `Local fixture setup requires localhost or 127.0.0.1, got ${host}.` };
  }
  return { ok: true, host };
}

function looksProductionLikeDatabase(parsed: URL, rawUrl: string): boolean {
  const combined = `${parsed.hostname} ${parsed.pathname} ${rawUrl}`.toLowerCase();
  return /\bprod\b|production|creditregulatorpro-prod|creditregulatorpro_prod/.test(combined);
}

export function validateDatabaseUrlForTarget(
  rawUrl: string | null,
  target: Target,
  sourceName: string,
  env: NodeJS.ProcessEnv,
): { ok: true; databaseUrl: string } | { ok: false; reason: string } {
  if (!rawUrl) return { ok: false, reason: "No fixture setup database URL was configured." };
  const parsed = dbParts(rawUrl);
  if (!parsed) return { ok: false, reason: `${sourceName} is not a valid database URL.` };
  if (looksProductionLikeDatabase(parsed, rawUrl)) {
    return { ok: false, reason: `Refusing production-looking database URL from ${sourceName}.` };
  }

  if (target === "local") {
    if (env.CRP_LOCAL_DEV !== "true") {
      return { ok: false, reason: "Refusing local fixture setup unless CRP_LOCAL_DEV=true." };
    }
    if (!LOCAL_DB_HOSTS.has(parsed.hostname.toLowerCase())) {
      return { ok: false, reason: `Refusing local fixture setup against non-local DB host ${parsed.hostname}.` };
    }
    const expectedDatabase = normalizeEnv(env.LOCAL_DATABASE_NAME);
    const actualDatabase = parsed.pathname.replace(/^\//, "");
    if (expectedDatabase && actualDatabase !== expectedDatabase) {
      return { ok: false, reason: `Refusing local fixture setup against ${actualDatabase}; expected ${expectedDatabase}.` };
    }
    return { ok: true, databaseUrl: parsed.toString() };
  }

  if (!["STAGING_DATABASE_URL", "CRP_STAGING_DATABASE_URL", "STAGING_FLOOT_DATABASE_URL", "FLOOT_DATABASE_URL"].includes(sourceName)) {
    return { ok: false, reason: `Staging fixture setup requires an explicit staging DB env, got ${sourceName}.` };
  }
  const stagingSignature = `${parsed.hostname} ${parsed.pathname}`.toLowerCase();
  if (!stagingSignature.includes("staging")) {
    return { ok: false, reason: `${sourceName} must clearly point to a staging database.` };
  }
  return { ok: true, databaseUrl: parsed.toString() };
}

function resolveDatabaseUrl(
  target: Target,
  env: NodeJS.ProcessEnv,
): { sourceName: string; rawUrl: string | null } {
  if (target === "staging") {
    for (const sourceName of ["STAGING_DATABASE_URL", "CRP_STAGING_DATABASE_URL", "STAGING_FLOOT_DATABASE_URL", "FLOOT_DATABASE_URL"] as const) {
      const rawUrl = normalizeEnv(env[sourceName]);
      if (rawUrl) return { sourceName, rawUrl };
    }
    return { sourceName: "STAGING_DATABASE_URL", rawUrl: null };
  }

  for (const sourceName of ["LOCAL_DATABASE_URL", "FLOOT_DATABASE_URL"] as const) {
    const rawUrl = normalizeEnv(env[sourceName]);
    if (rawUrl) return { sourceName, rawUrl };
  }
  return { sourceName: "LOCAL_DATABASE_URL", rawUrl: null };
}

export function buildFixtureSetupConfig(env: NodeJS.ProcessEnv): FixtureSetupConfig {
  if (!normalizeBoolean(env[FIXTURE_SETUP_GATE_ENV])) {
    return {
      status: "skipped",
      reason: `SKIPPED: ${FIXTURE_SETUP_GATE_ENV}=true is required.`,
    };
  }

  const target = normalizeTarget(env.CRP_OUTCOME_TRACKING_FIXTURE_TARGET);
  if (!target) {
    return {
      status: "skipped",
      reason: "SKIPPED: CRP_OUTCOME_TRACKING_FIXTURE_TARGET must be staging or local.",
    };
  }

  const baseUrl = target === "staging" ? normalizeEnv(env.STAGING_BASE_URL) : normalizeEnv(env.LOCAL_SMOKE_BASE_URL);
  if (!baseUrl) {
    return {
      status: "skipped",
      reason: target === "staging" ? "SKIPPED: STAGING_BASE_URL is required." : "SKIPPED: LOCAL_SMOKE_BASE_URL is required.",
    };
  }

  const hostCheck = validateFixtureHost(baseUrl, target);
  if (hostCheck.ok === false) return { status: "error", reason: hostCheck.reason };

  const outputPrefix = target === "staging" ? "STAGING" : "LOCAL_SMOKE";
  const marker = safeMarker(normalizeEnv(env.CRP_OUTCOME_TRACKING_FIXTURE_MARKER) ?? defaultMarker());
  if (!markerIsSynthetic(marker)) {
    return { status: "error", reason: "Synthetic fixture marker must start with OUTCOME_SMOKE_." };
  }

  const source = sourceFromEnv(env[FIXTURE_SETUP_SOURCE_ENV]);
  if (source === "api") {
    const auth = resolveAuthConfig(env, outputPrefix);
    if (!auth) {
      return {
        status: "skipped",
        reason:
          outputPrefix === "STAGING"
            ? "SKIPPED: API fixture setup requires STAGING_ADMIN_EMAIL/STAGING_ADMIN_PASSWORD, STAGING_USER_EMAIL/STAGING_USER_PASSWORD, STAGING_ADMIN_SESSION_COOKIE, or STAGING_USER_SESSION_COOKIE."
            : "SKIPPED: API fixture setup requires LOCAL_SMOKE_ADMIN_EMAIL/LOCAL_SMOKE_ADMIN_PASSWORD, LOCAL_SMOKE_USER_EMAIL/LOCAL_SMOKE_USER_PASSWORD, LOCAL_SMOKE_ADMIN_SESSION_COOKIE, or LOCAL_SMOKE_USER_SESSION_COOKIE.",
      };
    }

    return {
      status: "ready",
      source: "api",
      target,
      baseUrl,
      host: hostCheck.host,
      outputPrefix,
      marker,
      scenario: scenarioFromEnv(env.CRP_OUTCOME_TRACKING_FIXTURE_SCENARIO),
      ...auth,
    };
  }

  const { sourceName, rawUrl } = resolveDatabaseUrl(target, env);
  const dbCheck = validateDatabaseUrlForTarget(rawUrl, target, sourceName, env);
  if (dbCheck.ok === false) return { status: "error", reason: dbCheck.reason };

  return {
    status: "ready",
    source: "db",
    target,
    baseUrl,
    host: hostCheck.host,
    databaseUrl: dbCheck.databaseUrl,
    databaseUrlSource: sourceName,
    outputPrefix,
    marker,
    scenario: scenarioFromEnv(env.CRP_OUTCOME_TRACKING_FIXTURE_SCENARIO),
  };
}

function hashMarker(value: string, suffix: string): string {
  return createHash("sha256").update(`${value}:${suffix}`).digest("hex");
}

export function buildSyntheticReportData(marker: string, bureauName: string, role: "previous" | "later"): Json {
  return {
    fileName: `${marker}-${role}-credit-report.json`,
    bureauName,
    parserQuality: {
      sourceBureauName: bureauName,
      confidenceScore: 98,
      requiresManualReview: false,
      reasonCodes: ["OUTCOME_SMOKE_SYNTHETIC_FIXTURE"],
    },
    syntheticOutcomeSmoke: {
      marker,
      role,
      syntheticOnly: true,
      containsRealConsumerData: false,
    },
  } as unknown as Json;
}

export function buildSyntheticTradelineValues(config: Pick<FixtureSetupConfig & { status: "ready" }, "marker" | "scenario">) {
  const status = config.scenario === "unchanged"
    ? { previous: "Collection", later: "Collection", expectedOutcomeTypes: ["unchanged"] }
    : { previous: "Collection", later: "Current", expectedOutcomeTypes: ["corrected"] };
  return {
    creditorName: `OUTCOME_SMOKE_CREDITOR_${config.marker}`,
    accountNumber: `OUTCOME-SMOKE-ACCT-1234-${config.marker.slice(-6)}`,
    accountType: "outcome_smoke_revolving",
    openDate: new Date("2020-01-02T00:00:00.000Z"),
    balance: 1200,
    creditLimit: 1500,
    amountPastDue: config.scenario === "unchanged" ? 1200 : 0,
    previousStatus: status.previous,
    laterStatus: status.later,
    expectedOutcomeTypes: status.expectedOutcomeTypes,
  };
}

export function assertSyntheticPayloadSafe(value: unknown): void {
  const serialized = JSON.stringify(value);
  const forbidden = [
    /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/,
    /\b(?:\d[ -]?){12,19}\b/,
    /rawReportText|rawExtractedText|raw pdf text|sourceText":/i,
    /bucket:\/\/|s3:\/\/|gs:\/\/|x-goog-signature|storageUrl/i,
    /floot_built_app_session|cookie=|session=/i,
    /sk-[a-z0-9_-]+|api[_-]?key|private key|-----BEGIN/i,
    /postgres:\/\/|database_url/i,
  ].find((pattern) => pattern.test(serialized));
  if (forbidden) throw new Error(`Synthetic fixture payload failed safety check: ${forbidden}.`);
}

export function outputForRows(
  config: Extract<FixtureSetupConfig, { status: "ready" }>,
  rows: SyntheticOutcomeFixtureRows,
) {
  const prefix = config.outputPrefix;
  return {
    status: "created" as const,
    target: config.target,
    marker: rows.marker,
    previousReportArtifactId: rows.previousReportArtifactId,
    laterReportArtifactId: rows.laterReportArtifactId,
    expectedOutcomeTypes: rows.expectedOutcomeTypes,
    suggestedEnv: {
      [`${prefix}_OUTCOME_PREVIOUS_REPORT_ARTIFACT_ID`]: String(rows.previousReportArtifactId),
      [`${prefix}_OUTCOME_LATER_REPORT_ARTIFACT_ID`]: String(rows.laterReportArtifactId),
      [`${prefix}_OUTCOME_SYNTHETIC_MARKER`]: rows.marker,
      [`${prefix}_OUTCOME_EXPECTED_OUTCOME_TYPES`]: rows.expectedOutcomeTypes.join(","),
      ...(rows.expectedOutcomeTypes.includes("response_received")
        ? { [`${prefix}_OUTCOME_RUN_RESPONSE_ONLY`]: "true" }
        : {}),
    },
    createdIds: {
      userId: rows.userId,
      bureauId: rows.bureauId,
      creditorId: rows.creditorId,
      previousTradelineId: rows.previousTradelineId,
      laterTradelineId: rows.laterTradelineId,
    },
    packetFindingFixtures: "deferred",
    cleanup: FIXTURE_CLEANUP_POSTURE,
  };
}

async function insertSyntheticFixtureRows(
  db: Kysely<DB>,
  config: Extract<FixtureSetupConfig, { status: "ready" }>,
): Promise<SyntheticOutcomeFixtureRows> {
  const createdAt = new Date();
  const bureauName = `OUTCOME_SMOKE_BUREAU_${config.marker}`;
  const tradeline = buildSyntheticTradelineValues(config);
  assertSyntheticPayloadSafe({ config: { marker: config.marker, scenario: config.scenario }, bureauName, tradeline });

  return db.transaction().execute(async (trx) => {
    const user = await trx
      .insertInto("users")
      .values({
        email: `${config.marker.toLowerCase()}@example.test`,
        displayName: `Synthetic ${config.marker}`,
        avatarUrl: null,
        organizationId: null,
        emailVerified: true,
        role: "user",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const userId = Number(user.id);

    const bureau = await trx
      .insertInto("bureau")
      .values({
        name: bureauName,
        address: null,
        addressLine1: "OUTCOME SMOKE SYNTHETIC BUREAU ADDRESS",
        addressLine2: null,
        city: "OUTCOME_SMOKE_CITY",
        province: "OS",
        postalCode: "Z9Z 9Z9",
        contactEmail: null,
        contactPhone: null,
        region: "CA",
        createdAt,
      } as any)
      .returning("id")
      .executeTakeFirstOrThrow();
    const bureauId = Number(bureau.id);

    const creditor = await trx
      .insertInto("creditor")
      .values({
        name: tradeline.creditorName,
        address: "OUTCOME SMOKE SYNTHETIC CREDITOR ADDRESS",
        contactEmail: null,
        contactPhone: null,
        createdAt,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const creditorId = Number(creditor.id);

    const previousReport = await trx
      .insertInto("reportArtifact")
      .values({
        artifactType: "credit_report",
        reportDate: new Date("2026-01-01T00:00:00.000Z"),
        data: buildSyntheticReportData(config.marker, bureauName, "previous"),
        storageUrl: null,
        sha256: hashMarker(config.marker, "previous-report"),
        userId,
        organizationId: null,
        region: "CA",
        createdAt,
        processingStatus: "completed",
      } as any)
      .returning("id")
      .executeTakeFirstOrThrow();
    const previousReportArtifactId = Number(previousReport.id);

    const laterReport = await trx
      .insertInto("reportArtifact")
      .values({
        artifactType: "credit_report",
        reportDate: new Date("2026-02-01T00:00:00.000Z"),
        data: buildSyntheticReportData(config.marker, bureauName, "later"),
        storageUrl: null,
        sha256: hashMarker(config.marker, "later-report"),
        userId,
        organizationId: null,
        region: "CA",
        createdAt,
        processingStatus: "completed",
      } as any)
      .returning("id")
      .executeTakeFirstOrThrow();
    const laterReportArtifactId = Number(laterReport.id);

    const baseTradeline = {
      accountNumber: tradeline.accountNumber,
      accountType: tradeline.accountType,
      bureauId,
      creditorId,
      userId,
      openedDate: tradeline.openDate,
      balance: tradeline.balance,
      currentBalance: tradeline.balance,
      amountPastDue: tradeline.amountPastDue,
      creditLimit: tradeline.creditLimit,
      dateOfFirstDelinquency: new Date("2022-04-01T00:00:00.000Z"),
      originalCreditorName: "OUTCOME_SMOKE_ORIGINAL_CREDITOR",
      collectionAgencyName: null,
      sourceText: null,
      notes: config.marker,
      createdAt,
    };

    const previousTradeline = await trx
      .insertInto("tradeline")
      .values({
        ...baseTradeline,
        reportArtifactId: previousReportArtifactId,
        status: tradeline.previousStatus,
      } as any)
      .returning("id")
      .executeTakeFirstOrThrow();
    const previousTradelineId = Number(previousTradeline.id);

    const laterTradeline = await trx
      .insertInto("tradeline")
      .values({
        ...baseTradeline,
        reportArtifactId: laterReportArtifactId,
        status: tradeline.laterStatus,
      } as any)
      .returning("id")
      .executeTakeFirstOrThrow();
    const laterTradelineId = Number(laterTradeline.id);

    return {
      marker: config.marker,
      userId,
      bureauId,
      creditorId,
      previousReportArtifactId,
      laterReportArtifactId,
      previousTradelineId,
      laterTradelineId,
      expectedOutcomeTypes: tradeline.expectedOutcomeTypes,
    };
  });
}

export async function runFixtureSetup(config: Extract<FixtureSetupConfig, { status: "ready" }>) {
  if (config.source === "api") {
    return runApiFixtureSetup(config);
  }

  process.env.FLOOT_DATABASE_URL = config.databaseUrl;
  const { db } = await import("../helpers/db");
  try {
    const rows = await insertSyntheticFixtureRows(db, config);
    const output = outputForRows(config, rows);
    assertSyntheticPayloadSafe(output);
    return output;
  } finally {
    await db.destroy();
  }
}

function toAbsoluteUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

function cookieHeaderFromSetCookie(setCookie: string): string {
  const normalized = setCookie.replace(/^cookie:\s*/i, "").trim();
  const match = normalized.match(/floot_built_app_session=[^;,\s]+/);
  return match?.[0] ?? "";
}

async function loginWithCredentials(baseUrl: string, email: string, password: string): Promise<string> {
  const response = await fetch(toAbsoluteUrl(baseUrl, "/_api/auth/login_with_password"), {
    method: "POST",
    body: JSON.stringify({ email, password }),
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: baseUrl,
    },
  });
  if (!response.ok) {
    throw new Error(`Configured fixture setup credentials did not authenticate: HTTP ${response.status}.`);
  }

  const sessionCookie = cookieHeaderFromSetCookie(response.headers.get("set-cookie") ?? "");
  if (!sessionCookie) {
    throw new Error("Configured fixture setup credentials authenticated without returning a session cookie.");
  }
  return sessionCookie;
}

async function cookieForApiConfig(config: Extract<FixtureSetupConfig, { status: "ready"; source: "api" }>): Promise<string> {
  if (config.authMode === "session_cookie") {
    const sessionCookie = cookieHeaderFromSetCookie(config.sessionCookie!);
    if (!sessionCookie) {
      throw new Error("Configured fixture setup session cookie did not include floot_built_app_session.");
    }
    return sessionCookie;
  }

  return loginWithCredentials(config.baseUrl, config.email!, config.password!);
}

async function postJson(baseUrl: string, path: string, cookieHeader: string, body: unknown): Promise<any> {
  const response = await fetch(toAbsoluteUrl(baseUrl, path), {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Cookie: cookieHeader,
      Origin: baseUrl,
    },
  });
  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`API fixture setup ${path} returned HTTP ${response.status}: ${JSON.stringify(parsed)}`);
  }
  assertSyntheticPayloadSafe(parsed);
  return parsed;
}

async function createSyntheticReportArtifactViaApi(
  config: Extract<FixtureSetupConfig, { status: "ready"; source: "api" }>,
  cookieHeader: string,
  role: "previous" | "later",
): Promise<number> {
  const bureauName = `OUTCOME_SMOKE_BUREAU_${config.marker}`;
  const result = await postJson(config.baseUrl, "/_api/report-artifact/create", cookieHeader, {
    tradelineId: null,
    reportDate: role === "previous" ? "2026-01-01T00:00:00.000Z" : "2026-02-01T00:00:00.000Z",
    artifactType: "credit_report",
    data: buildSyntheticReportData(config.marker, bureauName, role),
    storageUrl: null,
    sha256: hashMarker(config.marker, `${role}-api-report`),
    expiresAt: null,
  });

  const id = Number(result?.artifact?.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`API fixture setup did not receive a valid ${role} report artifact ID.`);
  }
  return id;
}

async function runApiFixtureSetup(config: Extract<FixtureSetupConfig, { status: "ready"; source: "api" }>) {
  const cookieHeader = await cookieForApiConfig(config);
  const previousReportArtifactId = await createSyntheticReportArtifactViaApi(config, cookieHeader, "previous");
  const laterReportArtifactId = await createSyntheticReportArtifactViaApi(config, cookieHeader, "later");
  const output = outputForRows(config, {
    marker: config.marker,
    userId: null,
    bureauId: null,
    creditorId: null,
    previousReportArtifactId,
    laterReportArtifactId,
    previousTradelineId: null,
    laterTradelineId: null,
    expectedOutcomeTypes: ["response_received"],
  });
  assertSyntheticPayloadSafe(output);
  return output;
}

export function redactSecretText(value: string, env: NodeJS.ProcessEnv): string {
  const secretValues = [
    env.STAGING_DATABASE_URL,
    env.CRP_STAGING_DATABASE_URL,
    env.STAGING_FLOOT_DATABASE_URL,
    env.STAGING_ADMIN_PASSWORD,
    env.STAGING_ADMIN_SESSION_COOKIE,
    env.STAGING_USER_PASSWORD,
    env.STAGING_USER_SESSION_COOKIE,
    env.LOCAL_DATABASE_URL,
    env.LOCAL_SMOKE_ADMIN_PASSWORD,
    env.LOCAL_SMOKE_ADMIN_SESSION_COOKIE,
    env.LOCAL_SMOKE_USER_PASSWORD,
    env.LOCAL_SMOKE_USER_SESSION_COOKIE,
    env.FLOOT_DATABASE_URL,
    env.DATABASE_URL,
  ]
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length >= 4);
  const dbPasswords = secretValues
    .map((item) => {
      const parsed = dbParts(item);
      return parsed?.password ? decodeURIComponent(parsed.password) : "";
    })
    .filter((item) => item.length >= 4);

  return [...secretValues, ...dbPasswords].reduce((output, secret) => output.split(secret).join("[REDACTED]"), value);
}

export async function runCli(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const config = buildFixtureSetupConfig(env);
  if (config.status === "skipped") {
    console.log(config.reason);
    return SKIPPED_EXIT_CODE;
  }
  if (config.status === "error") {
    console.error(redactSecretText(config.reason, env));
    return 1;
  }

  try {
    const result = await runFixtureSetup(config);
    console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (error) {
    console.error(redactSecretText(error instanceof Error ? error.message : String(error), env));
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runCli().then((code) => {
    process.exitCode = code;
  });
}
