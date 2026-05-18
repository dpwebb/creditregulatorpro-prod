import "../../loadEnv.js";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql, type Kysely } from "kysely";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { DB, Json, UserRole } from "../../helpers/schema";
import { NotAuthenticatedError } from "../../helpers/getSetServerSession";
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
  rejectUnauthenticated: false,
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: vi.fn(async () => {
    if (auth.rejectUnauthenticated) throw new NotAuthenticatedError();
    if (!auth.user) throw new Error("Test authenticated user is not set.");
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
let adminReviewOutcome: EndpointHandle;

const created = {
  userIds: [] as number[],
  bureauIds: [] as number[],
  creditorIds: [] as number[],
  reportArtifactIds: [] as number[],
  tradelineIds: [] as number[],
  issueIds: [] as number[],
  packetIds: [] as number[],
  packetFindingIds: [] as number[],
  outcomeRunIds: [] as number[],
};

function track<T>(items: T[], value: T): T {
  items.push(value);
  return value;
}

function marker(): string {
  return `outcome-admin-review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    headers: { "Content-Type": "application/json", "user-agent": "synthetic-outcome-admin-review-test" },
    body: JSON.stringify(body),
  });
}

async function cleanupCreatedRows(): Promise<void> {
  if (!db) return;

  const userIds = Array.from(new Set(created.userIds));
  const outcomeRunIds = Array.from(new Set(created.outcomeRunIds));
  const packetIds = Array.from(new Set(created.packetIds));
  const packetFindingIds = Array.from(new Set(created.packetFindingIds));
  const issueIds = Array.from(new Set(created.issueIds));
  const tradelineIds = Array.from(new Set(created.tradelineIds));
  const reportArtifactIds = Array.from(new Set(created.reportArtifactIds));
  const creditorIds = Array.from(new Set(created.creditorIds));
  const bureauIds = Array.from(new Set(created.bureauIds));

  if (outcomeRunIds.length > 0) {
    await db.deleteFrom("auditLog").where("entityType", "=", "SYSTEM").where("entityId", "in", outcomeRunIds).execute();
    await db.deleteFrom("findingOutcome").where("comparisonRunId", "in", outcomeRunIds).execute();
    await db.deleteFrom("outcomeComparisonRun").where("id", "in", outcomeRunIds).execute();
  }
  if (userIds.length > 0) {
    await db.deleteFrom("findingOutcome").where("userId", "in", userIds).execute();
    await db.deleteFrom("outcomeComparisonRun").where("userId", "in", userIds).execute();
  }
  if (packetFindingIds.length > 0) {
    await db.deleteFrom("disputePacketFindings").where("id", "in", packetFindingIds).execute();
  }
  if (packetIds.length > 0) {
    await db.deleteFrom("evidenceEvent").where("packetId", "in", packetIds).execute();
    await db.deleteFrom("auditLog").where("entityType", "=", "PACKET").where("entityId", "in", packetIds).execute();
    await db.deleteFrom("packet").where("id", "in", packetIds).execute();
  }
  if (issueIds.length > 0) {
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
  created.packetFindingIds = [];
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

async function createReport(params: { userId: number; bureauName: string; marker: string }): Promise<number> {
  const row = await db
    .insertInto("reportArtifact")
    .values({
      artifactType: "credit_report",
      reportDate,
      data: {
        marker: params.marker,
        bureauName: params.bureauName,
        parserQuality: {
          sourceBureauName: params.bureauName,
          confidenceScore: 96,
          requiresManualReview: false,
        },
        rawExtractedText: "SYNTHETIC_RAW_REPORT_TEXT_SHOULD_NOT_APPEAR",
        fullSin: "123-456-789",
      } as unknown as Json,
      storageUrl: null,
      sha256: `${params.marker}-${Math.random().toString(36).slice(2)}`,
      userId: params.userId,
      region: "CA",
      createdAt: reportDate,
      processingStatus: "completed",
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
  accountNumber: string;
  status?: string | null;
}): Promise<number> {
  const row = await db
    .insertInto("tradeline")
    .values({
      accountNumber: params.accountNumber,
      accountType: "revolving",
      bureauId: params.bureauId,
      creditorId: params.creditorId,
      userId: params.userId,
      reportArtifactId: params.reportArtifactId,
      openedDate: new Date("2020-01-02T00:00:00.000Z"),
      status: params.status ?? "Collection",
      balance: 1200,
      currentBalance: 1200,
      amountPastDue: 1200,
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
      evidenceIds: ["ev-safe"] as unknown as Json,
      evidenceLocationSnapshot: [{ evidenceId: "ev-safe", pageNumber: 1 }] as unknown as Json,
      readinessSnapshot: { packetReady: true } as unknown as Json,
      packetItemSnapshot: { issueId: params.findingId, disputedField: "status" } as unknown as Json,
      statusAtCreation: "generated",
      selectedAt: reportDate,
      createdAt: reportDate,
      createdBy: params.userId,
      sourceVersion: "synthetic-test",
      backfilled: false,
    } as any)
    .returning("id")
    .executeTakeFirstOrThrow();
  return track(created.packetFindingIds, Number(row.id));
}

async function createScenario(options: { lineCount?: number; packetFinding?: boolean } = {}) {
  const id = marker();
  const owner = await createUser(`${id}-owner`);
  const other = await createUser(`${id}-other`);
  const support = await createUser(`${id}-support`, "support");
  const admin = await createUser(`${id}-admin`, "admin");
  const bureauName = `Equifax ${id}`;
  const bureauId = await createBureau(bureauName);
  const creditorId = await createCreditor(`Synthetic Bank ${id}`);
  const previousReportId = await createReport({ userId: owner.id, bureauName, marker: id });
  const laterReportId = await createReport({ userId: owner.id, bureauName, marker: id });
  const lineCount = options.lineCount ?? 1;
  const previousTradelineIds: number[] = [];
  const laterTradelineIds: number[] = [];

  for (let index = 0; index < lineCount; index++) {
    const accountNumber = `SYNTHETIC-ACCT-${7000 + index}`;
    previousTradelineIds.push(await createTradeline({
      userId: owner.id,
      reportArtifactId: previousReportId,
      bureauId,
      creditorId,
      accountNumber,
      status: "Collection",
    }));
    laterTradelineIds.push(await createTradeline({
      userId: owner.id,
      reportArtifactId: laterReportId,
      bureauId,
      creditorId,
      accountNumber,
      status: "Collection",
    }));
  }

  const findingId = await createFinding({ tradelineId: previousTradelineIds[0], creditorId });
  const packetId = await createPacket({ userId: owner.id, tradelineId: previousTradelineIds[0], bureauId, findingId });
  const packetFindingId = await createPacketFinding({
    packetId,
    findingId,
    reportArtifactId: previousReportId,
    tradelineId: previousTradelineIds[0],
    userId: owner.id,
    bureauId,
  });

  auth.user = owner;
  const response = await compareOutcome(postRequest("/_api/outcomes/compare", {
    previousReportArtifactId: previousReportId,
    laterReportArtifactId: options.packetFinding ? laterReportId : laterReportId,
    packetId: options.packetFinding ? packetId : undefined,
    comparisonScope: options.packetFinding ? "packet_findings" : "report_to_report",
    disputePacketFindingIds: options.packetFinding ? [packetFindingId] : undefined,
  }));
  const parsed = await response.json();
  if (parsed.comparisonRun?.id) track(created.outcomeRunIds, parsed.comparisonRun.id);

  return {
    owner,
    other,
    support,
    admin,
    previousReportId,
    laterReportId,
    previousTradelineIds,
    laterTradelineIds,
    findingId,
    packetId,
    packetFindingId,
    comparisonRun: parsed.comparisonRun,
  };
}

async function reviewBody(body: Record<string, unknown>) {
  const response = await adminReviewOutcome(postRequest("/_api/outcomes/admin-review", body));
  const parsed = await response.json();
  return { response, parsed };
}

function assertNoSensitiveLeak(value: unknown) {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain("123-456-789");
  expect(serialized).not.toContain("1234567890123456");
  expect(serialized).not.toContain("SYNTHETIC_RAW_REPORT_TEXT_SHOULD_NOT_APPEAR");
  expect(serialized).not.toContain("SYNTHETIC_PACKET_BODY_SHOULD_NOT_APPEAR");
  expect(serialized).not.toMatch(/bucket:\/\/|x-goog-signature|postgres:\/\/|database_url|private key|api[_-]?key|session=|token=/i);
  expect(serialized).not.toMatch(/you won|violated the law|admitted fault|entitled to damages|must pay|confirmed legal violation/i);
}

describeIfLocalDb("outcome admin-review endpoint", () => {
  beforeAll(async () => {
    db = (await import("../../helpers/db")).db;
    await (await import("../../helpers/disputePacketFindingsSchema")).ensureDisputePacketFindingsSchema();
    await (await import("../../helpers/outcomeTrackingSchema")).ensureOutcomeTrackingSchema();
    compareOutcome = (await import("../../endpoints/outcomes/compare_POST")).handle;
    adminReviewOutcome = (await import("../../endpoints/outcomes/admin-review_POST")).handle;
  });

  afterEach(async () => {
    auth.user = null;
    auth.rejectUnauthenticated = false;
    await cleanupCreatedRows();
  });

  afterAll(async () => {
    await db?.destroy();
  });

  it("adds review metadata columns and constraints without creating an outcome summary table", async () => {
    await (await import("../../helpers/outcomeTrackingSchema")).ensureOutcomeTrackingSchema();

    const columns = await sql<{ table_name: string; column_name: string }>`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name in ('outcome_comparison_run', 'finding_outcome')
        and column_name in (
          'admin_review_status',
          'admin_review_notes',
          'reviewed_by',
          'reviewed_at',
          'review_evidence_ids',
          'review_source_version',
          'review_action',
          'review_updated_at'
        )
      order by table_name, column_name
    `.execute(db);

    expect(columns.rows.map((row: any) => `${row.tableName}.${row.columnName}`)).toEqual(
      expect.arrayContaining([
        "outcome_comparison_run.admin_review_status",
        "outcome_comparison_run.admin_review_notes",
        "outcome_comparison_run.reviewed_by",
        "outcome_comparison_run.reviewed_at",
        "outcome_comparison_run.review_updated_at",
        "finding_outcome.admin_review_status",
        "finding_outcome.admin_review_notes",
        "finding_outcome.reviewed_by",
        "finding_outcome.reviewed_at",
        "finding_outcome.review_evidence_ids",
        "finding_outcome.review_source_version",
        "finding_outcome.review_action",
        "finding_outcome.review_updated_at",
      ]),
    );

    const constraints = await sql<{ conname: string }>`
      select conname
      from pg_constraint
      where conrelid in ('public.outcome_comparison_run'::regclass, 'public.finding_outcome'::regclass)
    `.execute(db);
    expect(constraints.rows.map((row) => row.conname)).toEqual(
      expect.arrayContaining([
        "outcome_comparison_run_admin_review_status_check",
        "finding_outcome_admin_review_status_check",
        "finding_outcome_review_action_check",
      ]),
    );

    const tables = await sql<{ table_name: string }>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'packet_outcome_summary'
    `.execute(db);
    expect(tables.rows).toHaveLength(0);
  });

  it("enforces admin-only access and denies unauthenticated, user, and support callers", async () => {
    const scenario = await createScenario();
    const findingOutcomeId = scenario.comparisonRun.findingOutcomes[0].id;

    auth.rejectUnauthenticated = true;
    let result = await reviewBody({
      comparisonRunId: scenario.comparisonRun.id,
      findingOutcomeId,
      reviewAction: "review_outcome",
    });
    expect(result.response.status).toBe(401);

    auth.rejectUnauthenticated = false;
    auth.user = scenario.owner;
    result = await reviewBody({
      comparisonRunId: scenario.comparisonRun.id,
      findingOutcomeId,
      reviewAction: "review_outcome",
    });
    expect(result.response.status).toBe(403);

    auth.user = scenario.support;
    result = await reviewBody({
      comparisonRunId: scenario.comparisonRun.id,
      findingOutcomeId,
      reviewAction: "review_outcome",
    });
    expect(result.response.status).toBe(403);

    auth.user = scenario.admin;
    result = await reviewBody({
      comparisonRunId: scenario.comparisonRun.id,
      findingOutcomeId,
      reviewAction: "review_outcome",
    });
    expect(result.response.status).toBe(200);
    expect(result.parsed.comparisonRun.findingOutcomes[0].adminReviewStatus).toBe("reviewed");
  });

  it("validates run/finding relationships and rejects unsupported override actions", async () => {
    const first = await createScenario();
    const second = await createScenario();
    auth.user = first.admin;

    let result = await reviewBody({
      comparisonRunId: first.comparisonRun.id,
      findingOutcomeId: second.comparisonRun.findingOutcomes[0].id,
      reviewAction: "review_outcome",
    });
    expect(result.response.status).toBe(400);
    expect(result.parsed.error).toMatch(/does not belong/i);

    result = await reviewBody({
      comparisonRunId: 999_999_991,
      reviewAction: "archive_review",
      explicitConfirmation: true,
    });
    expect(result.response.status).toBe(404);

    result = await reviewBody({
      comparisonRunId: first.comparisonRun.id,
      findingOutcomeId: 999_999_992,
      reviewAction: "review_outcome",
    });
    expect(result.response.status).toBe(404);

    result = await reviewBody({
      comparisonRunId: first.comparisonRun.id,
      findingOutcomeId: first.comparisonRun.findingOutcomes[0].id,
      reviewAction: "override_to_corrected",
    });
    expect(result.response.status).toBe(400);
  });

  it("implements review actions, required confirmations, and run-level status derivation", async () => {
    const scenario = await createScenario({ lineCount: 2 });
    const [firstFinding, secondFinding] = scenario.comparisonRun.findingOutcomes;
    auth.user = scenario.admin;

    let result = await reviewBody({
      comparisonRunId: scenario.comparisonRun.id,
      findingOutcomeId: firstFinding.id,
      reviewAction: "mark_needs_review",
    });
    expect(result.response.status).toBe(400);
    expect(result.parsed.error).toMatch(/notes are required/i);

    result = await reviewBody({
      comparisonRunId: scenario.comparisonRun.id,
      findingOutcomeId: firstFinding.id,
      reviewAction: "confirm_outcome",
      reviewNotes: "Confirmed for admin review. Deterministic result preserved.",
    });
    expect(result.response.status).toBe(400);
    expect(result.parsed.error).toMatch(/canonical/i);

    result = await reviewBody({
      comparisonRunId: scenario.comparisonRun.id,
      findingOutcomeId: firstFinding.id,
      reviewAction: "confirm_outcome",
      reviewNotes: "Confirmed for admin review. Deterministic result preserved.",
      confirmNoCanonicalChange: true,
      confirmNoRuntimeActivation: true,
    });
    expect(result.response.status).toBe(200);
    expect(result.parsed.comparisonRun.adminReviewStatus).toBe("partially_reviewed");
    expect(result.parsed.comparisonRun.status).toBe(scenario.comparisonRun.status);
    expect(result.parsed.comparisonRun.findingOutcomes.find((finding: any) => finding.id === firstFinding.id).adminReviewStatus).toBe("confirmed");

    result = await reviewBody({
      comparisonRunId: scenario.comparisonRun.id,
      findingOutcomeId: secondFinding.id,
      reviewAction: "review_outcome",
    });
    expect(result.response.status).toBe(200);
    expect(result.parsed.comparisonRun.adminReviewStatus).toBe("reviewed");

    const needsReviewScenario = await createScenario();
    auth.user = scenario.admin;
    result = await reviewBody({
      comparisonRunId: needsReviewScenario.comparisonRun.id,
      findingOutcomeId: needsReviewScenario.comparisonRun.findingOutcomes[0].id,
      reviewAction: "mark_needs_review",
      reviewNotes: "Needs review because matching confidence requires a human check.",
    });
    expect(result.response.status).toBe(200);
    expect(result.parsed.comparisonRun.adminReviewStatus).toBe("needs_review");

    result = await reviewBody({
      comparisonRunId: needsReviewScenario.comparisonRun.id,
      reviewAction: "archive_review",
    });
    expect(result.response.status).toBe(400);

    result = await reviewBody({
      comparisonRunId: needsReviewScenario.comparisonRun.id,
      reviewAction: "archive_review",
      explicitConfirmation: true,
    });
    expect(result.response.status).toBe(200);
    expect(result.parsed.comparisonRun.adminReviewStatus).toBe("archived");
  });

  it("preserves deterministic outcome fields, snapshots, and source records while writing sanitized audit", async () => {
    const scenario = await createScenario({ packetFinding: true });
    const findingOutcomeId = scenario.comparisonRun.findingOutcomes[0].id;
    const before = {
      reportArtifact: await db.selectFrom("reportArtifact").selectAll().where("id", "=", scenario.previousReportId).executeTakeFirstOrThrow(),
      tradeline: await db.selectFrom("tradeline").selectAll().where("id", "=", scenario.previousTradelineIds[0]).executeTakeFirstOrThrow(),
      issue: await db.selectFrom("creditorObligationTest").selectAll().where("id", "=", scenario.findingId).executeTakeFirstOrThrow(),
      packet: await db.selectFrom("packet").selectAll().where("id", "=", scenario.packetId).executeTakeFirstOrThrow(),
      packetFinding: await db.selectFrom("disputePacketFindings").selectAll().where("id", "=", scenario.packetFindingId).executeTakeFirstOrThrow(),
      findingOutcome: await db.selectFrom("findingOutcome").selectAll().where("id", "=", findingOutcomeId).executeTakeFirstOrThrow(),
    };

    auth.user = scenario.admin;
    const result = await reviewBody({
      comparisonRunId: scenario.comparisonRun.id,
      findingOutcomeId,
      reviewAction: "reject_match",
      reviewNotes: "Match rejected for review purposes. Deterministic result preserved.",
      evidenceIds: ["ev-safe"],
      confirmNoCanonicalChange: true,
      confirmNoRuntimeActivation: true,
    });
    expect(result.response.status).toBe(200);
    assertNoSensitiveLeak(result.parsed);

    const after = {
      reportArtifact: await db.selectFrom("reportArtifact").selectAll().where("id", "=", scenario.previousReportId).executeTakeFirstOrThrow(),
      tradeline: await db.selectFrom("tradeline").selectAll().where("id", "=", scenario.previousTradelineIds[0]).executeTakeFirstOrThrow(),
      issue: await db.selectFrom("creditorObligationTest").selectAll().where("id", "=", scenario.findingId).executeTakeFirstOrThrow(),
      packet: await db.selectFrom("packet").selectAll().where("id", "=", scenario.packetId).executeTakeFirstOrThrow(),
      packetFinding: await db.selectFrom("disputePacketFindings").selectAll().where("id", "=", scenario.packetFindingId).executeTakeFirstOrThrow(),
      findingOutcome: await db.selectFrom("findingOutcome").selectAll().where("id", "=", findingOutcomeId).executeTakeFirstOrThrow(),
    };

    expect(after.reportArtifact).toEqual(before.reportArtifact);
    expect(after.tradeline).toEqual(before.tradeline);
    expect(after.issue).toEqual(before.issue);
    expect(after.packet).toEqual(before.packet);
    expect(after.packetFinding).toEqual(before.packetFinding);
    expect(after.findingOutcome.outcomeType).toBe(before.findingOutcome.outcomeType);
    expect(after.findingOutcome.matchingMethod).toBe(before.findingOutcome.matchingMethod);
    expect(after.findingOutcome.confidenceLevel).toBe(before.findingOutcome.confidenceLevel);
    expect(after.findingOutcome.outcomeReasonCodes).toEqual(before.findingOutcome.outcomeReasonCodes);
    expect(after.findingOutcome.previousSnapshot).toEqual(before.findingOutcome.previousSnapshot);
    expect(after.findingOutcome.laterSnapshot).toEqual(before.findingOutcome.laterSnapshot);
    expect(after.findingOutcome.adminReviewStatus).toBe("rejected_match");

    const audit = await db
      .selectFrom("auditLog")
      .selectAll()
      .where("entityType", "=", "SYSTEM")
      .where("entityId", "=", scenario.comparisonRun.id)
      .orderBy("id", "desc")
      .executeTakeFirstOrThrow();
    expect(audit.details).toMatchObject({
      component: "outcome_tracking",
      action: "reject_match",
      comparisonRunId: scenario.comparisonRun.id,
      findingOutcomeId,
      outcomeType: before.findingOutcome.outcomeType,
      matchingMethod: before.findingOutcome.matchingMethod,
      confidenceLevel: before.findingOutcome.confidenceLevel,
      deterministicResultPreserved: true,
      sourceRecordsMutated: false,
      runtimeActivation: false,
      overridePathCreated: false,
      furnisherFlowCreated: false,
    });
    assertNoSensitiveLeak(audit.details);
  });

  it("rejects sensitive or legal-conclusion review notes before storage or audit", async () => {
    const scenario = await createScenario();
    const findingOutcomeId = scenario.comparisonRun.findingOutcomes[0].id;
    auth.user = scenario.admin;

    for (const reviewNotes of [
      "SIN 123-456-789 should not be stored.",
      "Full account 1234567890123456 should not be stored.",
      "Raw report text should not be stored.",
      "The bureau violated the law.",
    ]) {
      const result = await reviewBody({
        comparisonRunId: scenario.comparisonRun.id,
        findingOutcomeId,
        reviewAction: "reject_classification",
        reviewNotes,
        confirmNoCanonicalChange: true,
        confirmNoRuntimeActivation: true,
      });
      expect(result.response.status).toBe(400);
      assertNoSensitiveLeak(result.parsed);
    }

    const stored = await db.selectFrom("findingOutcome").selectAll().where("id", "=", findingOutcomeId).executeTakeFirstOrThrow();
    expect(stored.adminReviewStatus).toBe("unreviewed");
  });

  it("keeps admin review code out of parser, OCR, packet generation, violation firing, runtime activation, and override paths", () => {
    const source = [
      readFileSync(resolve("helpers/outcomeTrackingService.ts"), "utf8"),
      readFileSync(resolve("endpoints/outcomes/admin-review_POST.ts"), "utf8"),
      readFileSync(resolve("endpoints/outcomes/admin-review_POST.schema.ts"), "utf8"),
    ].join("\n");

    expect(source).not.toMatch(/pdfTextExtractor|ocr|deterministicCreditReportPipeline|extractCanonical/i);
    expect(source).not.toMatch(/buildSimpleDisputePacketContent|createDisputePacket|generatePacket|generatePacketContentPdfBase64/i);
    expect(source).not.toMatch(/evaluatePacketReadiness|validateDisputePacketReadiness|packetReadiness/i);
    expect(source).not.toMatch(/scanAndPersistViolations|detectViolations|complianceScanner|fireViolation/i);
    expect(source).not.toMatch(/activateRuntime|runtimeBridgeMapping|regulationRuntimeTruth|regulationRegistry/i);
    expect(source).not.toMatch(/override_to_corrected|override_to_removed|force_outcome|make_final_truth/i);
    expect(source).not.toMatch(/direct furnisher|furnisher packet/i);
    expect(source).not.toMatch(/updateTable\("reportArtifact"\)|updateTable\("tradeline"\)|updateTable\("creditorObligationTest"\)|updateTable\("packet"\)|updateTable\("disputePacketFindings"\)/);
    expect(source).not.toMatch(/insertInto\("packet"\)|insertInto\("creditorObligationTest"\)|insertInto\("tradeline"\)/);
  });
});
