import "../../loadEnv.js";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql, type Kysely } from "kysely";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { DB, Json, UserRole } from "../../helpers/schema";
import { assertSafeLocalDatabaseUrl } from "../utils/localDbHarness";

type EndpointHandle = (request: Request) => Promise<Response>;

type AuthUser = {
  id: number;
  role: UserRole;
  email: string;
  displayName: string;
  organizationId: number | null;
};

const auth = vi.hoisted(() => ({
  user: null as AuthUser | null,
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: vi.fn(async () => {
    if (!auth.user) {
      throw new Error("Test authenticated user is not set.");
    }
    return { user: auth.user };
  }),
}));

const safeDbUrl = (() => {
  try {
    return assertSafeLocalDatabaseUrl(process.env);
  } catch {
    return null;
  }
})();

const describeIfLocalDb = safeDbUrl ? describe : describe.skip;
const reportDate = new Date("2026-05-17T00:00:00.000Z");

let db: Kysely<DB>;
let compareOutcome: EndpointHandle;
let listOutcomes: EndpointHandle;
let getOutcome: EndpointHandle;

const created = {
  userIds: [] as number[],
  bureauIds: [] as number[],
  creditorIds: [] as number[],
  reportArtifactIds: [] as number[],
  tradelineIds: [] as number[],
  issueIds: [] as number[],
  packetIds: [] as number[],
  outcomeRunIds: [] as number[],
};

function track<T>(items: T[], value: T): T {
  items.push(value);
  return value;
}

function marker(): string {
  return `outcome-tracking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function authUserFromRow(row: { id: number; email: string; displayName: string; organizationId: number | null; role: UserRole }): AuthUser {
  return {
    id: Number(row.id),
    email: row.email,
    displayName: row.displayName,
    organizationId: row.organizationId,
    role: row.role,
  };
}

function postRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "user-agent": "synthetic-outcome-test" },
    body: JSON.stringify(body),
  });
}

function getRequest(path: string): Request {
  return new Request(`http://localhost${path}`, {
    method: "GET",
    headers: { "user-agent": "synthetic-outcome-test" },
  });
}

function json<T = any>(value: unknown): T {
  return value as T;
}

async function cleanupCreatedRows(): Promise<void> {
  if (!db) return;

  const userIds = Array.from(new Set(created.userIds));
  const outcomeRunIds = Array.from(new Set(created.outcomeRunIds));
  const packetIds = Array.from(new Set(created.packetIds));
  const issueIds = Array.from(new Set(created.issueIds));
  const tradelineIds = Array.from(new Set(created.tradelineIds));
  const reportArtifactIds = Array.from(new Set(created.reportArtifactIds));
  const creditorIds = Array.from(new Set(created.creditorIds));
  const bureauIds = Array.from(new Set(created.bureauIds));

  if (outcomeRunIds.length > 0) {
    await db.deleteFrom("findingOutcome").where("comparisonRunId", "in", outcomeRunIds).execute();
    await db.deleteFrom("outcomeComparisonRun").where("id", "in", outcomeRunIds).execute();
  }
  if (userIds.length > 0) {
    await db.deleteFrom("findingOutcome").where("userId", "in", userIds).execute();
    await db.deleteFrom("outcomeComparisonRun").where("userId", "in", userIds).execute();
  }
  if (packetIds.length > 0) {
    await db.deleteFrom("disputePacketFindings").where("disputePacketId", "in", packetIds).execute();
    await db.deleteFrom("evidenceEvent").where("packetId", "in", packetIds).execute();
    await db.deleteFrom("auditLog").where("entityType", "=", "PACKET").where("entityId", "in", packetIds).execute();
    await db.deleteFrom("packet").where("id", "in", packetIds).execute();
  }
  if (issueIds.length > 0) {
    await db.deleteFrom("disputePacketFindings").where("creditorObligationTestId", "in", issueIds).execute();
    await db.deleteFrom("packet").where("creditorObligationTestId", "in", issueIds).execute();
    await db.deleteFrom("creditorObligationTest").where("id", "in", issueIds).execute();
  }
  if (tradelineIds.length > 0) {
    await db.deleteFrom("tradelineArtifactPresence").where("tradelineId", "in", tradelineIds).execute();
    await db.deleteFrom("tradeline").where("id", "in", tradelineIds).execute();
  }
  if (reportArtifactIds.length > 0) {
    await db.deleteFrom("auditLog").where("entityType", "=", "REPORT_ARTIFACT").where("entityId", "in", reportArtifactIds).execute();
    await db.deleteFrom("reportArtifact").where("id", "in", reportArtifactIds).execute();
  }
  if (creditorIds.length > 0) await db.deleteFrom("creditor").where("id", "in", creditorIds).execute();
  if (bureauIds.length > 0) await db.deleteFrom("bureau").where("id", "in", bureauIds).execute();
  if (userIds.length > 0) {
    await db.deleteFrom("auditLog").where("userId", "in", userIds).execute();
    await db.deleteFrom("users").where("id", "in", userIds).execute();
  }

  created.userIds = [];
  created.bureauIds = [];
  created.creditorIds = [];
  created.reportArtifactIds = [];
  created.tradelineIds = [];
  created.issueIds = [];
  created.packetIds = [];
  created.outcomeRunIds = [];
}

async function createUser(name: string, role: UserRole = "user"): Promise<AuthUser> {
  const row = await db
    .insertInto("users")
    .values({
      email: `${name}@example.test`,
      displayName: `Synthetic ${name}`,
      avatarUrl: null,
      organizationId: null,
      emailVerified: true,
      role,
    })
    .returning(["id", "email", "displayName", "organizationId", "role"])
    .executeTakeFirstOrThrow();
  track(created.userIds, Number(row.id));
  return authUserFromRow(row);
}

async function createBureau(name: string): Promise<number> {
  const row = await db
    .insertInto("bureau")
    .values({
      name,
      address: null,
      addressLine1: "100 Synthetic Bureau Street",
      addressLine2: null,
      city: "Halifax",
      province: "NS",
      postalCode: "B3J 0A1",
      contactEmail: null,
      contactPhone: null,
      region: "CA",
      createdAt: reportDate,
    } as any)
    .returning("id")
    .executeTakeFirstOrThrow();
  return track(created.bureauIds, Number(row.id));
}

async function createCreditor(name: string): Promise<number> {
  const row = await db
    .insertInto("creditor")
    .values({
      name,
      address: "Synthetic creditor address",
      contactEmail: null,
      contactPhone: null,
      createdAt: reportDate,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return track(created.creditorIds, Number(row.id));
}

async function createReport(params: {
  userId: number;
  bureauName: string;
  data?: Record<string, unknown>;
  processingStatus?: string;
}): Promise<number> {
  const row = await db
    .insertInto("reportArtifact")
    .values({
      artifactType: "credit_report",
      reportDate,
      data: {
        bureauName: params.bureauName,
        parserQuality: {
          sourceBureauName: params.bureauName,
          confidenceScore: 96,
          requiresManualReview: false,
        },
        ...params.data,
      } as unknown as Json,
      storageUrl: null,
      sha256: `${params.bureauName.toLowerCase().replace(/\s+/g, "-")}-${Math.random().toString(36).slice(2)}`,
      userId: params.userId,
      region: "CA",
      createdAt: reportDate,
      processingStatus: params.processingStatus ?? "completed",
    } as any)
    .returning("id")
    .executeTakeFirstOrThrow();
  return track(created.reportArtifactIds, Number(row.id));
}

async function createTradeline(params: {
  userId: number;
  reportArtifactId: number;
  bureauId: number;
  creditorId: number;
  accountNumber?: string;
  status?: string | null;
  balance?: number | null;
  amountPastDue?: number | null;
  openedDate?: Date;
}): Promise<number> {
  const row = await db
    .insertInto("tradeline")
    .values({
      accountNumber: params.accountNumber ?? "SYNTHETIC-ACCT-6789",
      accountType: "revolving",
      bureauId: params.bureauId,
      creditorId: params.creditorId,
      userId: params.userId,
      reportArtifactId: params.reportArtifactId,
      openedDate: params.openedDate ?? new Date("2020-01-02T00:00:00.000Z"),
      status: params.status ?? "Collection",
      balance: params.balance ?? 1200,
      currentBalance: params.balance ?? 1200,
      amountPastDue: params.amountPastDue ?? 1200,
      creditLimit: 1500,
      dateOfFirstDelinquency: new Date("2022-04-01T00:00:00.000Z"),
      originalCreditorName: "Synthetic Bank",
      collectionAgencyName: null,
      createdAt: reportDate,
    } as any)
    .returning("id")
    .executeTakeFirstOrThrow();
  return track(created.tradelineIds, Number(row.id));
}

async function createFinding(params: { tradelineId: number; creditorId: number }): Promise<number> {
  const row = await db
    .insertInto("creditorObligationTest")
    .values({
      tradelineId: params.tradelineId,
      creditorId: params.creditorId,
      obligationType: "ACCURACY_INTEGRITY",
      obligationState: "CHALLENGED",
      violationCategory: "ACCOUNT_STATUS_INCONSISTENCY",
      statutoryBasis: "Synthetic review reference",
      technicalDetails: { targetFields: ["status"] } as unknown as Json,
      userExplanation: "Synthetic finding explanation",
      recommendedAction: "Review this item",
      validationStatus: "verified",
      confidenceScore: 95,
      autoGenerated: true,
      detectedAt: reportDate,
      createdAt: reportDate,
      updatedAt: reportDate,
      userStatus: "active",
    } as any)
    .returning("id")
    .executeTakeFirstOrThrow();
  return track(created.issueIds, Number(row.id));
}

async function createPacket(params: { userId: number; tradelineId: number; bureauId: number; findingId: number }): Promise<number> {
  const row = await db
    .insertInto("packet")
    .values({
      userId: params.userId,
      tradelineId: params.tradelineId,
      bureauId: params.bureauId,
      creditorObligationTestId: params.findingId,
      type: "credit_bureau_dispute",
      status: "generated",
      processingStatus: "completed",
      content: "SYNTHETIC_PACKET_BODY_SHOULD_NOT_APPEAR",
      createdAt: reportDate,
      region: "CA",
    } as any)
    .returning("id")
    .executeTakeFirstOrThrow();
  return track(created.packetIds, Number(row.id));
}

async function createPacketFinding(params: {
  packetId: number;
  findingId: number;
  reportArtifactId: number;
  tradelineId: number;
  userId: number;
  bureauId: number;
}): Promise<number> {
  const row = await db
    .insertInto("disputePacketFindings")
    .values({
      disputePacketId: params.packetId,
      creditorObligationTestId: params.findingId,
      reportArtifactId: params.reportArtifactId,
      tradelineId: params.tradelineId,
      userId: params.userId,
      bureauId: params.bureauId,
      packetType: "credit_bureau",
      evidenceIds: ["ev-safe", "sk-synthetic-secret"] as unknown as Json,
      evidenceLocationSnapshot: [
        {
          evidenceId: "ev-safe",
          pageNumber: 1,
          boundingBox: { x: 1, y: 2, width: 3, height: 4 },
          coordinateSource: "native_pdf",
          textSnippet: "SIN 123-456-789 raw report text",
          storageUrl: "bucket://private/path?X-Goog-Signature=secret",
        },
      ] as unknown as Json,
      readinessSnapshot: { packetReady: true } as unknown as Json,
      packetItemSnapshot: {
        issueId: params.findingId,
        tradelineId: params.tradelineId,
        disputedField: "status",
        packetBody: "SYNTHETIC_PACKET_BODY_SHOULD_NOT_APPEAR",
      } as unknown as Json,
      statusAtCreation: "generated",
      selectedAt: reportDate,
      createdAt: reportDate,
      createdBy: params.userId,
      sourceVersion: "synthetic-test",
      backfilled: false,
    } as any)
    .returning("id")
    .executeTakeFirstOrThrow();
  return Number(row.id);
}

async function createBaseScenario(options: {
  marker: string;
  laterStatus?: string | null;
  laterTradelines?: "same" | "missing" | "ambiguous";
  laterBureauName?: string;
  laterParserQuality?: Record<string, unknown>;
  otherUserLater?: boolean;
}): Promise<{
  owner: AuthUser;
  other: AuthUser;
  admin: AuthUser;
  support: AuthUser;
  previousReportId: number;
  laterReportId: number;
  packetId: number;
  packetFindingId: number;
}> {
  const owner = await createUser(`${options.marker}-owner`);
  const other = await createUser(`${options.marker}-other`);
  const admin = await createUser(`${options.marker}-admin`, "admin");
  const support = await createUser(`${options.marker}-support`, "support");
  const previousBureauName = `Equifax ${options.marker}`;
  const laterBureauName = options.laterBureauName === "TransUnion" ? `TransUnion ${options.marker}` : previousBureauName;
  const bureau = await createBureau(previousBureauName);
  const laterBureau = laterBureauName === previousBureauName ? bureau : await createBureau(laterBureauName);
  const creditor = await createCreditor(`Synthetic Bank ${options.marker}`);
  const previousReportId = await createReport({
    userId: owner.id,
    bureauName: previousBureauName,
    data: {
      rawExtractedText: "SYNTHETIC_RAW_REPORT_TEXT_SHOULD_NOT_APPEAR",
      fullSin: "123-456-789",
    },
  });
  const laterReportId = await createReport({
    userId: options.otherUserLater ? other.id : owner.id,
    bureauName: laterBureauName,
    data: options.laterParserQuality ? { parserQuality: options.laterParserQuality } : undefined,
    processingStatus: options.laterParserQuality?.requiresManualReview === true ? "completed" : "completed",
  });
  const previousTradelineId = await createTradeline({
    userId: owner.id,
    reportArtifactId: previousReportId,
    bureauId: bureau,
    creditorId: creditor,
    accountNumber: "1234567890123456",
    status: "Collection",
  });
  if (options.laterTradelines !== "missing") {
    await createTradeline({
      userId: options.otherUserLater ? other.id : owner.id,
      reportArtifactId: laterReportId,
      bureauId: laterBureau,
      creditorId: creditor,
      accountNumber: "1234567890123456",
      status: options.laterStatus ?? "Collection",
    });
  }
  if (options.laterTradelines === "ambiguous") {
    await createTradeline({
      userId: owner.id,
      reportArtifactId: laterReportId,
      bureauId: laterBureau,
      creditorId: creditor,
      accountNumber: "1234567890123456",
      status: options.laterStatus ?? "Collection",
    });
  }
  const findingId = await createFinding({ tradelineId: previousTradelineId, creditorId: creditor });
  const packetId = await createPacket({ userId: owner.id, tradelineId: previousTradelineId, bureauId: bureau, findingId });
  const packetFindingId = await createPacketFinding({
    packetId,
    findingId,
    reportArtifactId: previousReportId,
    tradelineId: previousTradelineId,
    userId: owner.id,
    bureauId: bureau,
  });

  return { owner, other, admin, support, previousReportId, laterReportId, packetId, packetFindingId };
}

async function compareBody(body: Record<string, unknown>) {
  const response = await compareOutcome(postRequest("/_api/outcomes/compare", body));
  const parsed = await response.json();
  if (parsed.comparisonRun?.id) track(created.outcomeRunIds, parsed.comparisonRun.id);
  return { response, parsed };
}

function assertPrivacySafe(payload: unknown) {
  const serialized = JSON.stringify(payload);
  expect(serialized).not.toContain("123-456-789");
  expect(serialized).not.toContain("1234567890123456");
  expect(serialized).not.toContain("SYNTHETIC_RAW_REPORT_TEXT_SHOULD_NOT_APPEAR");
  expect(serialized).not.toContain("raw report text");
  expect(serialized).not.toContain("SYNTHETIC_PACKET_BODY_SHOULD_NOT_APPEAR");
  expect(serialized).not.toContain("bucket://private");
  expect(serialized).not.toContain("X-Goog-Signature");
  expect(serialized).not.toContain("sk-synthetic-secret");
  expect(serialized).not.toMatch(/postgres:\/\/|DATABASE_URL|private key|session=|token=/i);
}

describeIfLocalDb("persisted outcome tracking endpoints", () => {
  beforeAll(async () => {
    db = (await import("../../helpers/db")).db;
    await (await import("../../helpers/disputePacketFindingsSchema")).ensureDisputePacketFindingsSchema();
    await (await import("../../helpers/outcomeTrackingSchema")).ensureOutcomeTrackingSchema();
    compareOutcome = (await import("../../endpoints/outcomes/compare_POST")).handle;
    listOutcomes = (await import("../../endpoints/outcomes/list_GET")).handle;
    getOutcome = (await import("../../endpoints/outcomes/get_GET")).handle;
  });

  afterEach(async () => {
    auth.user = null;
    await cleanupCreatedRows();
  });

  afterAll(async () => {
    await db?.destroy();
  });

  it("creates outcome tables idempotently with required constraints and no summary table", async () => {
    await (await import("../../helpers/outcomeTrackingSchema")).ensureOutcomeTrackingSchema();

    const tables = await sql<{ tableName: string }>`
      select table_name as "tableName"
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('outcome_comparison_run', 'finding_outcome', 'packet_outcome_summary')
      order by table_name
    `.execute(db);
    expect(tables.rows.map((row) => row.tableName)).toEqual(["finding_outcome", "outcome_comparison_run"]);

    const constraints = await sql<{ conname: string }>`
      select conname
      from pg_constraint
      where conrelid in ('public.outcome_comparison_run'::regclass, 'public.finding_outcome'::regclass)
    `.execute(db);
    expect(constraints.rows.map((row) => row.conname)).toEqual(
      expect.arrayContaining([
        "outcome_comparison_run_scope_check",
        "outcome_comparison_run_status_check",
        "finding_outcome_type_check",
        "finding_outcome_confidence_level_check",
        "finding_outcome_matching_method_check",
      ]),
    );

    const indexes = await sql<{ indexname: string }>`
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and tablename in ('outcome_comparison_run', 'finding_outcome')
    `.execute(db);
    expect(indexes.rows.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        "idx_outcome_comparison_run_user_created_at",
        "idx_outcome_comparison_run_packet_id",
        "idx_finding_outcome_comparison_run_id",
        "idx_finding_outcome_outcome_type",
      ]),
    );
  });

  it("lets an owner persist unchanged, corrected, removed, needs-review, unresolved, not-comparable, and response-only outcomes", async () => {
    const unchanged = await createBaseScenario({ marker: marker(), laterTradelines: "same" });
    auth.user = unchanged.owner;
    let result = await compareBody({
      previousReportArtifactId: unchanged.previousReportId,
      laterReportArtifactId: unchanged.laterReportId,
      comparisonScope: "report_to_report",
    });
    expect(result.response.status).toBe(200);
    expect(result.parsed.comparisonRun.summary.unchanged).toBe(1);
    expect(result.parsed.comparisonRun.status).toBe("completed");

    const corrected = await createBaseScenario({ marker: marker(), laterStatus: "Current" });
    auth.user = corrected.owner;
    result = await compareBody({
      previousReportArtifactId: corrected.previousReportId,
      laterReportArtifactId: corrected.laterReportId,
      packetId: corrected.packetId,
      comparisonScope: "packet_findings",
      disputePacketFindingIds: [corrected.packetFindingId],
    });
    expect(result.response.status).toBe(200);
    expect(result.parsed.comparisonRun.summary.corrected).toBe(1);
    expect(result.parsed.comparisonRun.findingOutcomes[0]).toMatchObject({
      disputePacketId: corrected.packetId,
      disputePacketFindingId: corrected.packetFindingId,
      outcomeType: "corrected",
    });

    const removed = await createBaseScenario({ marker: marker(), laterTradelines: "missing" });
    auth.user = removed.owner;
    result = await compareBody({
      previousReportArtifactId: removed.previousReportId,
      laterReportArtifactId: removed.laterReportId,
      packetId: removed.packetId,
      comparisonScope: "packet_findings",
    });
    expect(result.response.status).toBe(200);
    expect(result.parsed.comparisonRun.summary.removed).toBe(1);

    const ambiguous = await createBaseScenario({ marker: marker(), laterTradelines: "ambiguous" });
    auth.user = ambiguous.owner;
    result = await compareBody({
      previousReportArtifactId: ambiguous.previousReportId,
      laterReportArtifactId: ambiguous.laterReportId,
      comparisonScope: "report_to_report",
    });
    expect(result.response.status).toBe(200);
    expect(result.parsed.comparisonRun.status).toBe("needs_review");
    expect(result.parsed.comparisonRun.summary.needsReview).toBe(1);

    const lowQuality = await createBaseScenario({
      marker: marker(),
      laterParserQuality: { sourceBureauName: "Equifax", confidenceScore: 42, requiresManualReview: true },
    });
    auth.user = lowQuality.owner;
    result = await compareBody({
      previousReportArtifactId: lowQuality.previousReportId,
      laterReportArtifactId: lowQuality.laterReportId,
      comparisonScope: "report_to_report",
    });
    expect(result.response.status).toBe(200);
    expect(result.parsed.comparisonRun.summary.unresolved).toBe(1);

    const crossBureau = await createBaseScenario({ marker: marker(), laterBureauName: "TransUnion" });
    auth.user = crossBureau.owner;
    result = await compareBody({
      previousReportArtifactId: crossBureau.previousReportId,
      laterReportArtifactId: crossBureau.laterReportId,
      comparisonScope: "report_to_report",
    });
    expect(result.response.status).toBe(200);
    expect(result.parsed.comparisonRun.summary.notComparable).toBe(1);

    const responseOnly = await createBaseScenario({ marker: marker() });
    auth.user = responseOnly.owner;
    result = await compareBody({
      previousReportArtifactId: responseOnly.previousReportId,
      packetId: responseOnly.packetId,
      comparisonScope: "response_only",
      response: {
        packetId: responseOnly.packetId,
        responseReceivedAt: "2026-05-20T00:00:00.000Z",
        responseType: "bureau_response",
        source: "bureau_response",
      },
    });
    expect(result.response.status).toBe(200);
    expect(result.parsed.comparisonRun.summary.responseReceived).toBe(1);
    expect(result.parsed.comparisonRun.summary.corrected).toBe(0);
    expect(result.parsed.comparisonRun.summary.removed).toBe(0);
  });

  it("rejects cross-user compares and keeps support scoped as non-admin", async () => {
    const scenario = await createBaseScenario({ marker: marker(), otherUserLater: true });

    auth.user = scenario.owner;
    let result = await compareBody({
      previousReportArtifactId: scenario.previousReportId,
      laterReportArtifactId: scenario.laterReportId,
      comparisonScope: "report_to_report",
    });
    expect(result.response.status).toBe(400);
    expect(JSON.stringify(result.parsed)).toContain("same user");

    auth.user = scenario.other;
    result = await compareBody({
      previousReportArtifactId: scenario.previousReportId,
      comparisonScope: "report_to_report",
    });
    expect(result.response.status).toBe(403);

    auth.user = scenario.support;
    result = await compareBody({
      previousReportArtifactId: scenario.previousReportId,
      comparisonScope: "report_to_report",
    });
    expect(result.response.status).toBe(403);

    auth.user = scenario.admin;
    result = await compareBody({
      previousReportArtifactId: scenario.previousReportId,
      comparisonScope: "report_to_report",
    });
    expect(result.response.status).toBe(200);
  });

  it("lists and gets only owner-scoped outcome runs while admins can read across owners", async () => {
    const scenario = await createBaseScenario({ marker: marker(), laterStatus: "Current" });
    auth.user = scenario.owner;
    const createdRun = await compareBody({
      previousReportArtifactId: scenario.previousReportId,
      laterReportArtifactId: scenario.laterReportId,
      packetId: scenario.packetId,
      comparisonScope: "packet_findings",
    });
    const runId = createdRun.parsed.comparisonRun.id;

    let response = await listOutcomes(getRequest("/_api/outcomes/list?limit=10&outcomeType=corrected"));
    expect(response.status).toBe(200);
    let body = await response.json();
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.runs.some((run: any) => run.id === runId)).toBe(true);
    expect(body.runs.find((run: any) => run.id === runId).summary.corrected).toBe(1);

    response = await getOutcome(getRequest(`/_api/outcomes/get?comparisonRunId=${runId}`));
    expect(response.status).toBe(200);
    body = await response.json();
    expect(body.comparisonRun.id).toBe(runId);
    expect(body.comparisonRun.findingOutcomes).toHaveLength(1);
    assertPrivacySafe(body);

    auth.user = scenario.other;
    response = await listOutcomes(getRequest("/_api/outcomes/list?limit=10"));
    expect(response.status).toBe(200);
    body = await response.json();
    expect(body.runs.some((run: any) => run.id === runId)).toBe(false);

    response = await getOutcome(getRequest(`/_api/outcomes/get?comparisonRunId=${runId}`));
    expect(response.status).toBe(404);

    auth.user = scenario.admin;
    response = await getOutcome(getRequest(`/_api/outcomes/get?comparisonRunId=${runId}`));
    expect(response.status).toBe(200);
    body = await response.json();
    expect(body.comparisonRun.id).toBe(runId);
  });

  it("persists only privacy-safe snapshots and leaves source report, finding, packet, and packet-finding rows unchanged", async () => {
    const scenario = await createBaseScenario({ marker: marker(), laterStatus: "Current" });

    const before = {
      previousReport: await db.selectFrom("reportArtifact").selectAll().where("id", "=", scenario.previousReportId).executeTakeFirstOrThrow(),
      packet: await db.selectFrom("packet").selectAll().where("id", "=", scenario.packetId).executeTakeFirstOrThrow(),
      packetFinding: await db.selectFrom("disputePacketFindings").selectAll().where("id", "=", scenario.packetFindingId).executeTakeFirstOrThrow(),
    };

    auth.user = scenario.owner;
    const result = await compareBody({
      previousReportArtifactId: scenario.previousReportId,
      laterReportArtifactId: scenario.laterReportId,
      packetId: scenario.packetId,
      comparisonScope: "packet_findings",
    });
    expect(result.response.status).toBe(200);
    assertPrivacySafe(result.parsed);

    const stored = await db
      .selectFrom("findingOutcome")
      .selectAll()
      .where("comparisonRunId", "=", result.parsed.comparisonRun.id)
      .execute();
    expect(stored).toHaveLength(1);
    assertPrivacySafe(stored);

    const after = {
      previousReport: await db.selectFrom("reportArtifact").selectAll().where("id", "=", scenario.previousReportId).executeTakeFirstOrThrow(),
      packet: await db.selectFrom("packet").selectAll().where("id", "=", scenario.packetId).executeTakeFirstOrThrow(),
      packetFinding: await db.selectFrom("disputePacketFindings").selectAll().where("id", "=", scenario.packetFindingId).executeTakeFirstOrThrow(),
    };
    expect(after.previousReport).toEqual(before.previousReport);
    expect(after.packet).toEqual(before.packet);
    expect(after.packetFinding).toEqual(before.packetFinding);
  });

  it("keeps outcome tracking sources away from parser, OCR, packet generation, readiness, violation firing, runtime activation, and override paths", () => {
    const source = [
      readFileSync(resolve("helpers/outcomeTrackingService.ts"), "utf8"),
      readFileSync(resolve("endpoints/outcomes/compare_POST.ts"), "utf8"),
      readFileSync(resolve("endpoints/outcomes/list_GET.ts"), "utf8"),
      readFileSync(resolve("endpoints/outcomes/get_GET.ts"), "utf8"),
    ].join("\n");

    expect(source).not.toMatch(/pdfTextExtractor|ocr|deterministicCreditReportPipeline|extractCanonical/i);
    expect(source).not.toMatch(/buildSimpleDisputePacketContent|createDisputePacket|generatePacket|generatePacketContentPdfBase64/i);
    expect(source).not.toMatch(/evaluatePacketReadiness|validateDisputePacketReadiness|packetReadiness/i);
    expect(source).not.toMatch(/scanAndPersistViolations|detectViolations|complianceScanner|fireViolation/i);
    expect(source).not.toMatch(/activateRuntime|runtimeBridgeMapping|regulationRuntimeTruth|regulationRegistry/i);
    expect(source).not.toMatch(/adminOverride|direct furnisher|furnisher packet/i);
    expect(source).not.toMatch(/updateTable\("reportArtifact"\)|updateTable\("tradeline"\)|updateTable\("creditorObligationTest"\)|updateTable\("packet"\)|updateTable\("disputePacketFindings"\)/);
    expect(source).not.toMatch(/insertInto\("packet"\)|insertInto\("creditorObligationTest"\)|insertInto\("tradeline"\)/);
  });
});
