import "../../loadEnv.js";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Kysely } from "kysely";
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
const reportDate = new Date("2026-05-18T00:00:00.000Z");

let db: Kysely<DB>;
let adminReviewResponse: EndpointHandle;

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
  findingOutcomeIds: [] as number[],
  responseIds: [] as number[],
};

function track<T>(items: T[], value: T): T {
  items.push(value);
  return value;
}

function marker(): string {
  return `response-admin-review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function postRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "user-agent": "synthetic-response-admin-review-test" },
    body: JSON.stringify(body),
  });
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

async function cleanupCreatedRows(): Promise<void> {
  if (!db) return;

  const responseIds = Array.from(new Set(created.responseIds));
  const findingOutcomeIds = Array.from(new Set(created.findingOutcomeIds));
  const outcomeRunIds = Array.from(new Set(created.outcomeRunIds));
  const packetFindingIds = Array.from(new Set(created.packetFindingIds));
  const packetIds = Array.from(new Set(created.packetIds));
  const issueIds = Array.from(new Set(created.issueIds));
  const tradelineIds = Array.from(new Set(created.tradelineIds));
  const reportArtifactIds = Array.from(new Set(created.reportArtifactIds));
  const creditorIds = Array.from(new Set(created.creditorIds));
  const bureauIds = Array.from(new Set(created.bureauIds));
  const userIds = Array.from(new Set(created.userIds));

  if (responseIds.length > 0) {
    await db.deleteFrom("auditLog").where("entityType", "=", "SYSTEM").where("entityId", "in", responseIds).execute();
    await db.deleteFrom("bureauResponseEvent").where("id", "in", responseIds).execute();
  }
  if (findingOutcomeIds.length > 0) await db.deleteFrom("findingOutcome").where("id", "in", findingOutcomeIds).execute();
  if (outcomeRunIds.length > 0) {
    await db.deleteFrom("findingOutcome").where("comparisonRunId", "in", outcomeRunIds).execute();
    await db.deleteFrom("outcomeComparisonRun").where("id", "in", outcomeRunIds).execute();
  }
  if (packetFindingIds.length > 0) await db.deleteFrom("disputePacketFindings").where("id", "in", packetFindingIds).execute();
  if (packetIds.length > 0) {
    await db.deleteFrom("evidenceEvent").where("packetId", "in", packetIds).execute();
    await db.deleteFrom("auditLog").where("entityType", "=", "PACKET").where("entityId", "in", packetIds).execute();
    await db.deleteFrom("packet").where("id", "in", packetIds).execute();
  }
  if (issueIds.length > 0) await db.deleteFrom("creditorObligationTest").where("id", "in", issueIds).execute();
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
  created.findingOutcomeIds = [];
  created.responseIds = [];
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
  return authUserFromRow({ ...row, id: track(created.userIds, Number(row.id)) });
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

async function createReport(params: { userId: number; bureauName: string; syntheticMarker: string }): Promise<number> {
  const row = await db
    .insertInto("reportArtifact")
    .values({
      artifactType: "credit_report",
      reportDate,
      data: {
        syntheticMarker: params.syntheticMarker,
        bureauName: params.bureauName,
        rawExtractedText: "SYNTHETIC_RAW_REPORT_TEXT_SHOULD_NOT_APPEAR",
        fullSin: "123-456-789",
      } as unknown as Json,
      storageUrl: null,
      sha256: `${params.syntheticMarker}-${Math.random().toString(36).slice(2)}`,
      userId: params.userId,
      region: "CA",
      createdAt: reportDate,
      processingStatus: "completed",
    } as any)
    .returning("id")
    .executeTakeFirstOrThrow();
  return track(created.reportArtifactIds, Number(row.id));
}

async function createTradeline(params: { userId: number; reportArtifactId: number; bureauId: number; creditorId: number }): Promise<number> {
  const row = await db
    .insertInto("tradeline")
    .values({
      accountNumber: "SYNTHETIC-ACCT-7001",
      accountType: "revolving",
      bureauId: params.bureauId,
      creditorId: params.creditorId,
      userId: params.userId,
      reportArtifactId: params.reportArtifactId,
      openedDate: new Date("2020-01-02T00:00:00.000Z"),
      status: "Collection",
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
      successOutcome: null,
      bureauResponseDate: null,
      responseType: null,
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
      evidenceIds: ["synthetic-evidence"] as unknown as Json,
      evidenceLocationSnapshot: [{ evidenceId: "synthetic-evidence", pageNumber: 1 }] as unknown as Json,
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

async function createOutcome(params: { userId: number; packetId: number; packetFindingId: number; findingId: number; tradelineId: number; bureauId: number; reportArtifactId: number }) {
  const run = await db
    .insertInto("outcomeComparisonRun")
    .values({
      userId: params.userId,
      previousReportArtifactId: params.reportArtifactId,
      laterReportArtifactId: null,
      packetId: params.packetId,
      bureauId: params.bureauId,
      comparisonScope: "response_only",
      status: "completed",
      sourceVersion: "synthetic-response-admin-review-test",
      warnings: [] as unknown as Json,
      createdBy: params.userId,
      startedAt: reportDate,
      completedAt: reportDate,
      createdAt: reportDate,
      updatedAt: reportDate,
    } as any)
    .returning("id")
    .executeTakeFirstOrThrow();
  const runId = track(created.outcomeRunIds, Number(run.id));
  const finding = await db
    .insertInto("findingOutcome")
    .values({
      comparisonRunId: runId,
      userId: params.userId,
      disputePacketId: params.packetId,
      disputePacketFindingId: params.packetFindingId,
      creditorObligationTestId: params.findingId,
      previousTradelineId: params.tradelineId,
      laterTradelineId: null,
      outcomeType: "response_received",
      confidenceLevel: "medium",
      matchingMethod: "response_only",
      outcomeReasonCodes: ["RESPONSE_WITHOUT_LATER_REPORT"] as unknown as Json,
      previousSnapshot: { creditorLabel: "Synthetic Bank", maskedAccount: "Account ending 7001" } as unknown as Json,
      laterSnapshot: null,
      evidenceIds: [] as unknown as Json,
      evidenceLocationSnapshot: [] as unknown as Json,
      responseReceivedAt: reportDate,
      responseDeadlineAt: null,
      createdAt: reportDate,
      updatedAt: reportDate,
    } as any)
    .returning("id")
    .executeTakeFirstOrThrow();
  return { comparisonRunId: runId, findingOutcomeId: track(created.findingOutcomeIds, Number(finding.id)) };
}

async function createResponse(params: {
  userId: number;
  packetId?: number | null;
  packetFindingId?: number | null;
  comparisonRunId?: number | null;
  findingOutcomeId?: number | null;
  bureauId?: number | null;
}) {
  const row = await db
    .insertInto("bureauResponseEvent")
    .values({
      userId: params.userId,
      packetId: params.packetId ?? null,
      disputePacketFindingId: params.packetFindingId ?? null,
      comparisonRunId: params.comparisonRunId ?? null,
      findingOutcomeId: params.findingOutcomeId ?? null,
      bureauId: params.bureauId ?? null,
      agencyId: null,
      responseChannel: "email",
      responseDocumentType: "bureau_email_response",
      responseReceivedAt: reportDate,
      responseSource: "manual_record",
      responseSubject: "Synthetic bureau email response",
      responseSenderDomain: "equifax.example.test",
      responseReferenceId: `SYNTHETIC-${Math.random().toString(36).slice(2, 8)}`,
      normalizedResponseHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      responseSummary: "A response was recorded. A later credit report comparison is still needed.",
      responseStatus: "received",
      createdBy: params.userId,
      createdAt: reportDate,
      updatedAt: reportDate,
    } as any)
    .returning("id")
    .executeTakeFirstOrThrow();
  return track(created.responseIds, Number(row.id));
}

async function createScenario() {
  const id = marker();
  const owner = await createUser(`${id}-owner`);
  const other = await createUser(`${id}-other`);
  const support = await createUser(`${id}-support`, "support");
  const admin = await createUser(`${id}-admin`, "admin");
  const bureauId = await createBureau(`Equifax ${id}`);
  const creditorId = await createCreditor(`Synthetic Bank ${id}`);
  const reportArtifactId = await createReport({ userId: owner.id, bureauName: `Equifax ${id}`, syntheticMarker: id });
  const tradelineId = await createTradeline({ userId: owner.id, reportArtifactId, bureauId, creditorId });
  const findingId = await createFinding({ tradelineId, creditorId });
  const packetId = await createPacket({ userId: owner.id, tradelineId, bureauId, findingId });
  const packetFindingId = await createPacketFinding({ packetId, findingId, reportArtifactId, tradelineId, userId: owner.id, bureauId });
  const outcome = await createOutcome({ userId: owner.id, packetId, packetFindingId, findingId, tradelineId, bureauId, reportArtifactId });
  const responseId = await createResponse({
    userId: owner.id,
    packetId,
    packetFindingId,
    comparisonRunId: outcome.comparisonRunId,
    findingOutcomeId: outcome.findingOutcomeId,
    bureauId,
  });

  return {
    owner,
    other,
    support,
    admin,
    bureauId,
    reportArtifactId,
    tradelineId,
    findingId,
    packetId,
    packetFindingId,
    comparisonRunId: outcome.comparisonRunId,
    findingOutcomeId: outcome.findingOutcomeId,
    responseId,
  };
}

function reviewBody(overrides: Record<string, unknown> = {}) {
  return {
    reviewAction: "mark_needs_review",
    reviewNotes: "response reviewed; later report comparison required",
    confirmEvidenceOnly: true,
    confirmNoCanonicalChange: true,
    confirmNoOutcomeClassification: true,
    ...overrides,
  };
}

async function review(body: Record<string, unknown>) {
  const response = await adminReviewResponse(postRequest("/_api/responses/admin-review", body));
  return { response, parsed: await response.json() };
}

function assertNoSensitiveLeak(value: unknown) {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain("123-456-789");
  expect(serialized).not.toContain("1234567890123456");
  expect(serialized).not.toContain("SYNTHETIC_RAW_REPORT_TEXT_SHOULD_NOT_APPEAR");
  expect(serialized).not.toContain("SYNTHETIC_PACKET_BODY_SHOULD_NOT_APPEAR");
  expect(serialized).not.toMatch(/bucket:\/\/|x-goog-signature|signed_url|postgres:\/\/|database_url|private key|api[_-]?key|session=|cookie=|token=|mailbox password|email auth token/i);
  expect(serialized).not.toMatch(/admitted fault|violated the law|you won|entitled to damages|proves correction|legal proof|must pay|confirmed legal violation/i);
}

describeIfLocalDb("response document admin-review endpoint", () => {
  beforeAll(async () => {
    db = (await import("../../helpers/db")).db;
    await (await import("../../helpers/responseDocumentSchema")).ensureResponseDocumentSchema();
    adminReviewResponse = (await import("../../endpoints/responses/admin-review_POST")).handle;
  });

  afterEach(async () => {
    auth.user = null;
    auth.rejectUnauthenticated = false;
    await cleanupCreatedRows();
  });

  afterAll(async () => {
    await db?.destroy();
  });

  it("enforces admin-only access and denies unauthenticated, user, and support callers", async () => {
    const scenario = await createScenario();

    auth.rejectUnauthenticated = true;
    let result = await review(reviewBody({ responseId: scenario.responseId }));
    expect(result.response.status).toBe(401);

    auth.rejectUnauthenticated = false;
    auth.user = scenario.owner;
    result = await review(reviewBody({ responseId: scenario.responseId }));
    expect(result.response.status).toBe(403);

    auth.user = scenario.support;
    result = await review(reviewBody({ responseId: scenario.responseId }));
    expect(result.response.status).toBe(403);

    auth.user = scenario.admin;
    result = await review(reviewBody({ responseId: scenario.responseId }));
    expect(result.response.status).toBe(200);
    expect(result.parsed.response.responseStatus).toBe("needs_review");
    expect(result.parsed.response.reviewedBy).toBe(scenario.admin.id);
    assertNoSensitiveLeak(result.parsed);
  });

  it("validates required notes, confirmations, supported actions, and existing response IDs", async () => {
    const scenario = await createScenario();
    auth.user = scenario.admin;

    let result = await review(reviewBody({ responseId: 999_999_991 }));
    expect(result.response.status).toBe(404);

    result = await review(reviewBody({ responseId: scenario.responseId, reviewNotes: "" }));
    expect(result.response.status).toBe(400);
    expect(result.parsed.error).toMatch(/notes are required/i);

    result = await review(reviewBody({ responseId: scenario.responseId, confirmEvidenceOnly: false }));
    expect(result.response.status).toBe(400);
    expect(result.parsed.error).toMatch(/evidence and metadata only/i);

    result = await review(reviewBody({ responseId: scenario.responseId, confirmNoCanonicalChange: false }));
    expect(result.response.status).toBe(400);
    expect(result.parsed.error).toMatch(/canonical/i);

    result = await review(reviewBody({ responseId: scenario.responseId, confirmNoOutcomeClassification: false }));
    expect(result.response.status).toBe(400);
    expect(result.parsed.error).toMatch(/outcome classification/i);

    result = await review(reviewBody({ responseId: scenario.responseId, reviewAction: "archive_response", reviewNotes: "" }));
    expect(result.response.status).toBe(400);

    result = await review(reviewBody({
      responseId: scenario.responseId,
      reviewAction: "archive_response",
      reviewNotes: "",
      explicitConfirmation: true,
    }));
    expect(result.response.status).toBe(200);
    expect(result.parsed.response.responseStatus).toBe("archived");

    for (const reviewAction of ["mark_corrected", "mark_removed", "mark_unchanged", "legal_violation", "admitted_fault", "activate", "force_outcome"]) {
      result = await review(reviewBody({ responseId: scenario.responseId, reviewAction }));
      expect(result.response.status).toBe(400);
    }
  });

  it("implements review actions and relationship validation for packet, finding, and outcome links", async () => {
    const scenario = await createScenario();
    const otherScenario = await createScenario();
    auth.user = scenario.admin;

    const unlinkedResponseId = await createResponse({ userId: scenario.owner.id });
    let result = await review(reviewBody({
      responseId: unlinkedResponseId,
      reviewAction: "mark_related",
    }));
    expect(result.response.status).toBe(400);

    result = await review(reviewBody({
      responseId: scenario.responseId,
      reviewAction: "mark_related",
      packetId: scenario.packetId,
      reviewNotes: "related to packet; captured as evidence",
    }));
    expect(result.response.status).toBe(200);
    expect(result.parsed.response.responseStatus).toBe("linked_to_packet");

    result = await review(reviewBody({
      responseId: scenario.responseId,
      reviewAction: "link_to_packet",
      packetId: otherScenario.packetId,
      reviewNotes: "related to packet",
    }));
    expect(result.response.status).toBe(400);

    result = await review(reviewBody({
      responseId: scenario.responseId,
      reviewAction: "link_to_packet",
      packetId: scenario.packetId,
      disputePacketFindingId: scenario.packetFindingId,
      reviewNotes: "related to packet",
    }));
    expect(result.response.status).toBe(200);
    expect(result.parsed.response).toMatchObject({
      packetId: scenario.packetId,
      disputePacketFindingId: scenario.packetFindingId,
      responseStatus: "linked_to_packet",
    });

    result = await review(reviewBody({
      responseId: scenario.responseId,
      reviewAction: "link_to_outcome",
      comparisonRunId: scenario.comparisonRunId,
      findingOutcomeId: otherScenario.findingOutcomeId,
      reviewNotes: "related to outcome",
    }));
    expect(result.response.status).toBe(400);

    result = await review(reviewBody({
      responseId: scenario.responseId,
      reviewAction: "link_to_outcome",
      comparisonRunId: scenario.comparisonRunId,
      findingOutcomeId: scenario.findingOutcomeId,
      reviewNotes: "related to outcome; later report comparison required",
    }));
    expect(result.response.status).toBe(200);
    expect(result.parsed.response).toMatchObject({
      comparisonRunId: scenario.comparisonRunId,
      findingOutcomeId: scenario.findingOutcomeId,
      responseStatus: "linked_to_outcome",
    });

    result = await review(reviewBody({
      responseId: scenario.responseId,
      reviewAction: "mark_unrelated",
      reviewNotes: "unrelated response",
    }));
    expect(result.response.status).toBe(200);
    expect(result.parsed.response.responseStatus).toBe("rejected_as_unrelated");

    result = await review(reviewBody({
      responseId: scenario.responseId,
      reviewAction: "add_review_note",
      reviewNotes: "response reviewed; captured as evidence",
    }));
    expect(result.response.status).toBe(200);
    expect(result.parsed.response.responseStatus).toBe("rejected_as_unrelated");
    expect(result.parsed.response.reviewNotes).toBe("response reviewed; captured as evidence");
  });

  it("keeps review metadata-only and preserves packet, canonical, finding, and deterministic outcome source records", async () => {
    const scenario = await createScenario();
    const before = {
      packet: await db.selectFrom("packet").selectAll().where("id", "=", scenario.packetId).executeTakeFirstOrThrow(),
      report: await db.selectFrom("reportArtifact").selectAll().where("id", "=", scenario.reportArtifactId).executeTakeFirstOrThrow(),
      tradeline: await db.selectFrom("tradeline").selectAll().where("id", "=", scenario.tradelineId).executeTakeFirstOrThrow(),
      finding: await db.selectFrom("creditorObligationTest").selectAll().where("id", "=", scenario.findingId).executeTakeFirstOrThrow(),
      outcome: await db.selectFrom("findingOutcome").selectAll().where("id", "=", scenario.findingOutcomeId).executeTakeFirstOrThrow(),
    };

    auth.user = scenario.admin;
    const result = await review(reviewBody({
      responseId: scenario.responseId,
      reviewAction: "link_to_outcome",
      comparisonRunId: scenario.comparisonRunId,
      findingOutcomeId: scenario.findingOutcomeId,
      reviewNotes: "related to outcome; later report comparison required",
    }));
    expect(result.response.status).toBe(200);
    expect(result.parsed.response.responseStatus).toBe("linked_to_outcome");
    assertNoSensitiveLeak(result.parsed);

    const after = {
      packet: await db.selectFrom("packet").selectAll().where("id", "=", scenario.packetId).executeTakeFirstOrThrow(),
      report: await db.selectFrom("reportArtifact").selectAll().where("id", "=", scenario.reportArtifactId).executeTakeFirstOrThrow(),
      tradeline: await db.selectFrom("tradeline").selectAll().where("id", "=", scenario.tradelineId).executeTakeFirstOrThrow(),
      finding: await db.selectFrom("creditorObligationTest").selectAll().where("id", "=", scenario.findingId).executeTakeFirstOrThrow(),
      outcome: await db.selectFrom("findingOutcome").selectAll().where("id", "=", scenario.findingOutcomeId).executeTakeFirstOrThrow(),
    };

    expect(after.packet).toEqual(before.packet);
    expect(after.report).toEqual(before.report);
    expect(after.tradeline).toEqual(before.tradeline);
    expect(after.finding).toEqual(before.finding);
    expect(after.outcome.outcomeType).toBe(before.outcome.outcomeType);
    expect(after.outcome.matchingMethod).toBe(before.outcome.matchingMethod);
    expect(after.outcome.confidenceLevel).toBe(before.outcome.confidenceLevel);
    expect(after.outcome.outcomeReasonCodes).toEqual(before.outcome.outcomeReasonCodes);
    expect(after.outcome.previousSnapshot).toEqual(before.outcome.previousSnapshot);
    expect(after.outcome.laterSnapshot).toEqual(before.outcome.laterSnapshot);
  });

  it("writes sanitized audit details for response admin review", async () => {
    const scenario = await createScenario();
    auth.user = scenario.admin;

    const result = await review(reviewBody({
      responseId: scenario.responseId,
      reviewAction: "mark_needs_review",
      reviewNotes: "needs review; captured as evidence",
    }));
    expect(result.response.status).toBe(200);

    const audit = await db
      .selectFrom("auditLog")
      .selectAll()
      .where("entityType", "=", "SYSTEM")
      .where("entityId", "=", scenario.responseId)
      .orderBy("id", "desc")
      .executeTakeFirstOrThrow();
    expect(audit).toMatchObject({ actionType: "UPDATE", status: "SUCCESS" });
    expect(audit.details).toMatchObject({
      component: "bureau_response_event",
      action: "response_admin_review",
      reviewAction: "mark_needs_review",
      responseId: scenario.responseId,
      previousResponseStatus: "received",
      newResponseStatus: "needs_review",
      packetId: scenario.packetId,
      disputePacketFindingId: scenario.packetFindingId,
      comparisonRunId: scenario.comparisonRunId,
      findingOutcomeId: scenario.findingOutcomeId,
      responseChannel: "email",
      responseDocumentType: "bureau_email_response",
      actorAdminId: scenario.admin.id,
      responseDocumentsRemainEvidenceMetadataOnly: true,
      laterReportComparisonRequired: true,
      canonicalFactsMutated: false,
      outcomeClassificationCreated: false,
      packetReadyStateChanged: false,
      packetTextChanged: false,
      runtimeActivation: false,
      overridePathCreated: false,
      furnisherFlowCreated: false,
    });
    assertNoSensitiveLeak(audit.details);
  });

  it("rejects sensitive review notes and forbidden legal-conclusion phrases before storage", async () => {
    const scenario = await createScenario();
    auth.user = scenario.admin;

    for (const reviewNotes of [
      "SIN 123-456-789",
      "Account number 1234567890123456",
      "raw report text",
      "raw pdf text",
      "full email body",
      "packet body",
      "bucket://private/path?X-Goog-Signature=secret",
      "session=secret",
      "database_url=postgres://secret",
      "mailbox password secret",
      "email auth token secret",
      "Equifax admitted fault",
      "The bureau corrected the item",
      "The bureau violated the law",
      "You won",
      "You are entitled to damages",
      "This proves correction",
      "This is legal proof",
      "The agency must pay",
      "demand enforcement",
      "mark corrected",
      "mark removed",
      "mark unchanged",
    ]) {
      const result = await review(reviewBody({ responseId: scenario.responseId, reviewNotes }));
      expect(result.response.status).toBe(400);
      assertNoSensitiveLeak(result.parsed);
    }

    const stored = await db.selectFrom("bureauResponseEvent").selectAll().where("id", "=", scenario.responseId).executeTakeFirstOrThrow();
    expect(stored.responseStatus).toBe("received");
    expect(stored.reviewNotes).toBeNull();
  });

  it("keeps response admin-review code away from parser, OCR, packet, violation, runtime truth, override, furnisher, and inbox paths", () => {
    const source = [
      readFileSync(resolve("helpers/responseDocumentService.ts"), "utf8"),
      readFileSync(resolve("endpoints/responses/admin-review_POST.ts"), "utf8"),
      readFileSync(resolve("endpoints/responses/admin-review_POST.schema.ts"), "utf8"),
    ].join("\n");

    expect(source).not.toMatch(/classifyBureauResponse|record-response|bureau-communication|responseAnalysisPipeline/i);
    expect(source).not.toMatch(/connectGmail|gmailSync|imapSync|inboxSync|mailboxIntegration|automatic inbox/i);
    expect(source).not.toMatch(/pdfTextExtractor|ocr|deterministicCreditReportPipeline|extractCanonical|parseCreditReport|ingestCorePipeline/i);
    expect(source).not.toMatch(/scanAndPersistViolations|detectViolations|complianceScanner|fireViolation/i);
    expect(source).not.toMatch(/buildSimpleDisputePacketContent|createDisputePacket|generatePacket|generatePacketContentPdfBase64/i);
    expect(source).not.toMatch(/evaluatePacketReadiness|validateDisputePacketReadiness|packetReadiness\(|packetWording\(/i);
    expect(source).not.toMatch(/activateRuntime|runtimeBridgeMapping|regulationRuntimeTruth|regulationRegistry/i);
    expect(source).not.toMatch(/override_to_corrected|override_to_removed|force_outcome|make_final_truth/i);
    expect(source).not.toMatch(/direct furnisher|furnisher packet/i);
    expect(source).not.toMatch(/updateTable\("packet"\)|updateTable\("reportArtifact"\)|updateTable\("tradeline"\)|updateTable\("creditorObligationTest"\)|updateTable\("findingOutcome"\)|updateTable\("outcomeComparisonRun"\)/);
    expect(source).not.toMatch(/insertInto\("packet"\)|insertInto\("creditorObligationTest"\)|insertInto\("tradeline"\)|insertInto\("findingOutcome"\)|insertInto\("outcomeComparisonRun"\)/);
  });
});
