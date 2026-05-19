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
const reportDate = new Date("2026-05-18T00:00:00.000Z");

let db: Kysely<DB>;
let captureResponse: EndpointHandle;
let listResponses: EndpointHandle;
let getResponse: EndpointHandle;
let getMetrics: EndpointHandle;

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
  evidenceAttachmentIds: [] as number[],
  responseIds: [] as number[],
};

function track<T>(items: T[], value: T): T {
  items.push(value);
  return value;
}

function marker(): string {
  return `response-document-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function postRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "user-agent": "synthetic-response-document-test" },
    body: JSON.stringify(body),
  });
}

function getRequest(path: string): Request {
  return new Request(`http://localhost${path}`, {
    method: "GET",
    headers: { "user-agent": "synthetic-response-document-test" },
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
  const evidenceAttachmentIds = Array.from(new Set(created.evidenceAttachmentIds));
  const outcomeRunIds = Array.from(new Set(created.outcomeRunIds));
  const findingOutcomeIds = Array.from(new Set(created.findingOutcomeIds));
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
    await sql`delete from public.response_processing_event where response_event_id in (${sql.join(responseIds)})`.execute(db);
    await db.deleteFrom("bureauResponseEvent").where("id", "in", responseIds).execute();
  }
  if (userIds.length > 0) {
    await sql`delete from public.response_processing_event where user_id in (${sql.join(userIds)})`.execute(db);
    await db.deleteFrom("bureauResponseEvent").where("userId", "in", userIds).execute();
  }
  if (evidenceAttachmentIds.length > 0) {
    await db.deleteFrom("evidenceAttachment").where("id", "in", evidenceAttachmentIds).execute();
  }
  if (findingOutcomeIds.length > 0) {
    await db.deleteFrom("findingOutcome").where("id", "in", findingOutcomeIds).execute();
  }
  if (outcomeRunIds.length > 0) {
    await db.deleteFrom("auditLog").where("entityType", "=", "REPORT_ARTIFACT").where("entityId", "in", reportArtifactIds.length ? reportArtifactIds : [-1]).execute();
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
  created.evidenceAttachmentIds = [];
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
        parserQuality: { sourceBureauName: params.bureauName, confidenceScore: 96, requiresManualReview: false },
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
      sourceVersion: "synthetic-response-document-test",
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

async function createEvidenceAttachment(params: { packetId: number; uploadedBy: number }): Promise<number> {
  const row = await db
    .insertInto("evidenceAttachment")
    .values({
      obligationInstanceId: null,
      packetId: params.packetId,
      fileName: "synthetic-email-response.pdf",
      fileType: "application/pdf",
      fileSizeBytes: 42,
      storageUrl: "bucket://private/path?X-Goog-Signature=secret",
      description: "Synthetic email response evidence attachment",
      uploadedBy: params.uploadedBy,
      region: "CA",
      uploadedAt: reportDate,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return track(created.evidenceAttachmentIds, Number(row.id));
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
  const evidenceAttachmentId = await createEvidenceAttachment({ packetId, uploadedBy: owner.id });

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
    evidenceAttachmentId,
  };
}

function captureBody(overrides: Record<string, unknown> = {}) {
  return {
    responseChannel: "email",
    responseDocumentType: "bureau_email_response",
    responseReceivedAt: "2026-05-18T12:00:00.000Z",
    responseSource: "manual_record",
    responseSubject: "Synthetic bureau response received",
    responseSenderDomain: "equifax.example.test",
    responseReferenceId: "SYNTHETIC-REF-001",
    responseSummary: "A response was recorded. A later credit report comparison is still needed to determine whether the item changed.",
    ...overrides,
  };
}

async function capture(body: Record<string, unknown>) {
  const response = await captureResponse(postRequest("/_api/responses/capture", body));
  const parsed = await response.json();
  if (parsed.response?.id) track(created.responseIds, Number(parsed.response.id));
  return { response, parsed };
}

async function list(path = "/_api/responses/list?limit=20") {
  const response = await listResponses(getRequest(path));
  return { response, parsed: await response.json() };
}

async function get(responseId: number) {
  const response = await getResponse(getRequest(`/_api/responses/get?responseId=${responseId}`));
  return { response, parsed: await response.json() };
}

async function metrics(path = "/_api/responses/metrics?lookbackHours=24") {
  const response = await getMetrics(getRequest(path));
  return { response, parsed: await response.json() };
}

function assertNoSensitiveLeak(value: unknown) {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain("123-456-789");
  expect(serialized).not.toContain("1234567890123456");
  expect(serialized).not.toContain("SYNTHETIC_RAW_REPORT_TEXT_SHOULD_NOT_APPEAR");
  expect(serialized).not.toContain("SYNTHETIC_PACKET_BODY_SHOULD_NOT_APPEAR");
  expect(serialized).not.toContain("bucket://private");
  expect(serialized).not.toMatch(/x-goog-signature|postgres:\/\/|database_url|private key|api[_-]?key|session=|cookie=|token=|mailbox password|email auth token/i);
  expect(serialized).not.toMatch(/admitted fault|violated the law|you won|entitled to damages|proves correction|legal proof|must pay/i);
}

describeIfLocalDb("response document capture endpoints", () => {
  beforeAll(async () => {
    db = (await import("../../helpers/db")).db;
    await (await import("../../helpers/responseDocumentSchema")).ensureResponseDocumentSchema();
    captureResponse = (await import("../../endpoints/responses/capture_POST")).handle;
    listResponses = (await import("../../endpoints/responses/list_GET")).handle;
    getResponse = (await import("../../endpoints/responses/get_GET")).handle;
    getMetrics = (await import("../../endpoints/responses/metrics_GET")).handle;
  });

  afterEach(async () => {
    auth.user = null;
    auth.rejectUnauthenticated = false;
    await cleanupCreatedRows();
  });

  afterAll(async () => {
    await db?.destroy();
  });

  it("creates response capture and append-only processing tables idempotently with safe indexes", async () => {
    await (await import("../../helpers/responseDocumentSchema")).ensureResponseDocumentSchema();
    await (await import("../../helpers/responseDocumentSchema")).ensureResponseDocumentSchema();

    const columns = await sql<{ table_name: string; column_name: string }>`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'bureau_response_event'
        and column_name in (
          'user_id',
          'packet_id',
          'dispute_packet_finding_id',
          'finding_outcome_id',
          'comparison_run_id',
          'bureau_id',
          'agency_id',
          'response_channel',
          'response_document_type',
          'response_received_at',
          'response_source',
          'response_subject',
          'response_sender_domain',
          'response_reference_id',
          'attachment_evidence_id',
          'evidence_attachment_id',
          'normalized_response_hash',
          'response_summary',
          'response_status',
          'created_by',
          'reviewed_by',
          'reviewed_at',
          'review_notes',
          'raw_artifact_metadata',
          'normalized_response_metadata',
          'latest_processing_event_id',
          'latest_processing_status',
          'latest_classification',
          'latest_classification_confidence',
          'latest_extraction_source',
          'latest_requires_manual_review'
        )
      order by column_name
    `.execute(db);

    expect(columns.rows.map((row: any) => row.columnName)).toEqual(
      expect.arrayContaining([
        "user_id",
        "packet_id",
        "finding_outcome_id",
        "comparison_run_id",
        "response_channel",
        "response_document_type",
        "response_received_at",
        "response_status",
        "latest_classification",
        "latest_requires_manual_review",
      ]),
    );

    const processingColumns = await sql<{ column_name: string }>`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'response_processing_event'
        and column_name in (
          'response_event_id',
          'user_id',
          'packet_id',
          'tradeline_id',
          'violation_id',
          'processing_status',
          'extraction_source',
          'classifier_rule_id',
          'parser_version',
          'classification',
          'classification_confidence',
          'requires_manual_review',
          'uncertainty_codes',
          'deterministic_extraction',
          'field_provenance',
          'rationale',
          'regulation_references',
          'readiness_impact',
          'violation_impact',
          'idempotency_key'
        )
      order by column_name
    `.execute(db);

    expect(processingColumns.rows.map((row: any) => row.columnName)).toEqual(
      expect.arrayContaining([
        "response_event_id",
        "classification",
        "classification_confidence",
        "field_provenance",
        "readiness_impact",
        "violation_impact",
      ]),
    );

    const constraints = await sql<{ conname: string }>`
      select conname
      from pg_constraint
      where conrelid = 'public.bureau_response_event'::regclass
    `.execute(db);
    expect(constraints.rows.map((row) => row.conname)).toEqual(
      expect.arrayContaining([
        "bureau_response_event_channel_check",
        "bureau_response_event_document_type_check",
        "bureau_response_event_status_check",
      ]),
    );

    const processingConstraints = await sql<{ conname: string }>`
      select conname
      from pg_constraint
      where conrelid = 'public.response_processing_event'::regclass
    `.execute(db);
    expect(processingConstraints.rows.map((row) => row.conname)).toEqual(
      expect.arrayContaining([
        "response_processing_event_status_check",
        "response_processing_event_source_check",
        "response_processing_event_classification_check",
      ]),
    );

    const reviewColumns = await sql<{ column_name: string }>`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'response_admin_review_event'
        and column_name in (
          'response_event_id',
          'user_id',
          'actor_admin_id',
          'review_action',
          'previous_response_status',
          'next_response_status',
          'review_notes_present',
          'review_notes_hash',
          'confirm_evidence_only',
          'confirm_no_canonical_change',
          'confirm_no_outcome_classification',
          'canonical_facts_mutated',
          'packet_ready_state_changed'
        )
      order by column_name
    `.execute(db);

    expect(reviewColumns.rows.map((row: any) => row.columnName)).toEqual(
      expect.arrayContaining([
        "response_event_id",
        "review_action",
        "previous_response_status",
        "next_response_status",
        "review_notes_hash",
        "packet_ready_state_changed",
      ]),
    );
  });

  it("captures owner response metadata, links packet/outcome/finding/evidence safely, writes audit, and mutates no source truth", async () => {
    const scenario = await createScenario();
    const before = {
      packet: await db.selectFrom("packet").selectAll().where("id", "=", scenario.packetId).executeTakeFirstOrThrow(),
      outcome: await db.selectFrom("findingOutcome").selectAll().where("id", "=", scenario.findingOutcomeId).executeTakeFirstOrThrow(),
      report: await db.selectFrom("reportArtifact").selectAll().where("id", "=", scenario.reportArtifactId).executeTakeFirstOrThrow(),
      finding: await db.selectFrom("creditorObligationTest").selectAll().where("id", "=", scenario.findingId).executeTakeFirstOrThrow(),
    };

    auth.user = scenario.owner;
    const result = await capture(captureBody({
      packetId: scenario.packetId,
      disputePacketFindingId: scenario.packetFindingId,
      comparisonRunId: scenario.comparisonRunId,
      findingOutcomeId: scenario.findingOutcomeId,
      evidenceAttachmentId: scenario.evidenceAttachmentId,
      responseSummary: "The bureau says the item remains verified as accurate with no change.",
      rawArtifactMetadata: { fileName: "synthetic-response.pdf", fileSha256: "a".repeat(64), ocrFallbackUsed: false },
      normalizedResponseMetadata: { senderType: "bureau", responseFamily: "verified" },
    }));

    expect(result.response.status).toBe(200);
    expect(result.parsed.response).toMatchObject({
      userId: scenario.owner.id,
      packetId: scenario.packetId,
      disputePacketFindingId: scenario.packetFindingId,
      comparisonRunId: scenario.comparisonRunId,
      findingOutcomeId: scenario.findingOutcomeId,
      evidenceAttachmentId: scenario.evidenceAttachmentId,
      responseChannel: "email",
      responseDocumentType: "bureau_email_response",
      responseStatus: "received",
      latestClassification: "remains",
      latestExtractionSource: "deterministic",
      latestRequiresManualReview: true,
    });
    expect(result.parsed.response.latestProcessingEvent).toMatchObject({
      classification: "remains",
      extractionSource: "deterministic",
      processingStatus: "manual_review",
      packetId: scenario.packetId,
      tradelineId: scenario.tradelineId,
      violationId: scenario.findingId,
      requiresManualReview: true,
    });
    expect(result.parsed.response.latestProcessingEvent.fieldProvenance.length).toBeGreaterThan(0);
    expect(result.parsed.response.latestProcessingEvent.readinessImpact).toMatchObject({
      readinessGateMutated: false,
    });
    expect(result.parsed.response.latestProcessingEvent.violationImpact).toMatchObject({
      violationTruthMutated: false,
      linkedViolationId: scenario.findingId,
    });
    expect(JSON.stringify(result.parsed.response)).not.toContain("storageUrl");
    assertNoSensitiveLeak(result.parsed);

    const processingRows = await sql<{ response_event_id: number }>`
      select response_event_id
      from public.response_processing_event
      where response_event_id = ${result.parsed.response.id}
    `.execute(db);
    expect(processingRows.rows).toHaveLength(1);

    const after = {
      packet: await db.selectFrom("packet").selectAll().where("id", "=", scenario.packetId).executeTakeFirstOrThrow(),
      outcome: await db.selectFrom("findingOutcome").selectAll().where("id", "=", scenario.findingOutcomeId).executeTakeFirstOrThrow(),
      report: await db.selectFrom("reportArtifact").selectAll().where("id", "=", scenario.reportArtifactId).executeTakeFirstOrThrow(),
      finding: await db.selectFrom("creditorObligationTest").selectAll().where("id", "=", scenario.findingId).executeTakeFirstOrThrow(),
    };
    expect(after.packet).toEqual(before.packet);
    expect(after.outcome).toEqual(before.outcome);
    expect(after.report).toEqual(before.report);
    expect(after.finding).toEqual(before.finding);

    const audit = await db
      .selectFrom("auditLog")
      .selectAll()
      .where("entityType", "=", "SYSTEM")
      .where("entityId", "=", result.parsed.response.id)
      .executeTakeFirst();
    expect(audit).toMatchObject({ actionType: "RESPONSE_RECORDED", status: "SUCCESS" });
    expect(audit?.details).toMatchObject({
      component: "bureau_response_event",
      action: "response_captured",
      responseId: result.parsed.response.id,
      packetId: scenario.packetId,
      findingOutcomeId: scenario.findingOutcomeId,
      comparisonRunId: scenario.comparisonRunId,
      responseProcessingStatus: "manual_review",
      responseClassification: "remains",
      deterministicExtraction: true,
      fallbackUsed: false,
      canonicalFactsMutated: false,
      violationTruthMutated: false,
      packetReadyStateChanged: false,
    });
    assertNoSensitiveLeak(audit);
  });

  it("enforces auth, owner/admin/support behavior, and cross-owner relationship validation", async () => {
    const scenario = await createScenario();

    auth.rejectUnauthenticated = true;
    let result = await capture(captureBody({ packetId: scenario.packetId }));
    expect(result.response.status).toBe(401);

    auth.rejectUnauthenticated = false;
    auth.user = scenario.other;
    result = await capture(captureBody({ packetId: scenario.packetId }));
    expect(result.response.status).toBe(400);
    expect(JSON.stringify(result.parsed)).toContain("same user");

    auth.user = scenario.support;
    result = await capture(captureBody({ packetId: scenario.packetId }));
    expect(result.response.status).toBe(403);

    auth.user = scenario.admin;
    result = await capture(captureBody({ userId: scenario.owner.id, packetId: scenario.packetId }));
    expect(result.response.status).toBe(200);
    expect(result.parsed.response.userId).toBe(scenario.owner.id);
  });

  it("rejects inconsistent packet, finding, outcome, and attachment links before write", async () => {
    const scenario = await createScenario();
    const otherScenario = await createScenario();
    auth.user = scenario.owner;

    let result = await capture(captureBody({
      packetId: scenario.packetId,
      disputePacketFindingId: otherScenario.packetFindingId,
    }));
    expect(result.response.status).toBe(400);

    result = await capture(captureBody({
      comparisonRunId: scenario.comparisonRunId,
      findingOutcomeId: otherScenario.findingOutcomeId,
    }));
    expect(result.response.status).toBe(400);

    result = await capture(captureBody({
      packetId: scenario.packetId,
      evidenceAttachmentId: otherScenario.evidenceAttachmentId,
    }));
    expect(result.response.status).toBe(400);

    const stored = await db.selectFrom("bureauResponseEvent").selectAll().where("userId", "=", scenario.owner.id).execute();
    expect(stored).toHaveLength(0);
  });

  it("rejects sensitive metadata and forbidden legal-conclusion language", async () => {
    const scenario = await createScenario();
    auth.user = scenario.owner;

    for (const responseSummary of [
      "Full SIN 123-456-789",
      "Account number 1234567890123456",
      "raw report text",
      "raw pdf text",
      "full email body",
      "packet body",
      "bucket://private/path?X-Goog-Signature=secret",
      "session=secret",
      "database_url=postgres://secret",
      "The bureau violated the law",
      "This proves correction",
      "The agency must pay",
    ]) {
      const result = await capture(captureBody({ packetId: scenario.packetId, responseSummary }));
      expect(result.response.status).toBe(400);
      assertNoSensitiveLeak(result.parsed);
    }

    const unsafeMetadata = await capture(captureBody({
      packetId: scenario.packetId,
      rawArtifactMetadata: { storageUrl: "s3://private/path?x-amz-signature=secret" },
    }));
    expect(unsafeMetadata.response.status).toBe(400);
    assertNoSensitiveLeak(unsafeMetadata.parsed);
  });

  it("lists and gets owner-scoped sanitized responses while admins can read across owners", async () => {
    const scenario = await createScenario();
    auth.user = scenario.owner;
    const createdResponse = await capture(captureBody({
      packetId: scenario.packetId,
      comparisonRunId: scenario.comparisonRunId,
      findingOutcomeId: scenario.findingOutcomeId,
      responseStatus: "linked_to_outcome",
    }));
    const responseId = createdResponse.parsed.response.id;

    let listed = await list(`/_api/responses/list?packetId=${scenario.packetId}&responseChannel=email&responseDocumentType=bureau_email_response&responseStatus=linked_to_outcome&limit=10&offset=0`);
    expect(listed.response.status).toBe(200);
    expect(listed.parsed.total).toBeGreaterThanOrEqual(1);
    expect(listed.parsed.responses.some((item: any) => item.id === responseId)).toBe(true);
    expect(listed.parsed.responses.find((item: any) => item.id === responseId)).toMatchObject({
      latestClassification: "unknown_manual_review",
      latestExtractionSource: "deterministic",
      latestRequiresManualReview: true,
    });
    assertNoSensitiveLeak(listed.parsed);

    let fetched = await get(responseId);
    expect(fetched.response.status).toBe(200);
    expect(fetched.parsed.response.id).toBe(responseId);
    expect(fetched.parsed.response.latestProcessingEvent).toMatchObject({
      classification: "unknown_manual_review",
      processingStatus: "manual_review",
      extractionSource: "deterministic",
      packetId: scenario.packetId,
      violationId: scenario.findingId,
      tradelineId: scenario.tradelineId,
    });
    assertNoSensitiveLeak(fetched.parsed);

    auth.user = scenario.other;
    listed = await list("/_api/responses/list?limit=10");
    expect(listed.response.status).toBe(200);
    expect(listed.parsed.responses.some((item: any) => item.id === responseId)).toBe(false);

    fetched = await get(responseId);
    expect(fetched.response.status).toBe(404);

    auth.user = scenario.admin;
    fetched = await get(responseId);
    expect(fetched.response.status).toBe(200);
    expect(fetched.parsed.response.id).toBe(responseId);

    auth.user = scenario.support;
    listed = await list("/_api/responses/list?limit=10");
    expect(listed.response.status).toBe(403);
  });

  it("exposes admin-only response processing metrics with uncertainty, suspicious, dead-letter, and stall alerts", async () => {
    const scenario = await createScenario();
    auth.user = scenario.admin;
    const before = await metrics();
    expect(before.response.status).toBe(200);
    const baselineOcrFallback = Number(before.parsed.metrics.totals.ocrFallback ?? 0);

    auth.user = scenario.owner;
    await capture(captureBody({
      packetId: scenario.packetId,
      responseSummary: "The response includes no method of verification and no supporting documents.",
      rawArtifactMetadata: { fileSha256: "c".repeat(64), ocrFallbackUsed: false },
    }));

    auth.user = scenario.admin;
    const afterFalseOcr = await metrics();
    expect(afterFalseOcr.response.status).toBe(200);
    expect(afterFalseOcr.parsed.metrics.totals.ocrFallback).toBe(baselineOcrFallback);

    auth.user = scenario.owner;
    await capture(captureBody({
      packetId: scenario.packetId,
      responseSummary: "The response includes no method of verification and no supporting documents.",
      rawArtifactMetadata: { fileSha256: "b".repeat(64), ocrFallbackUsed: true },
    }));

    auth.user = scenario.admin;
    const result = await metrics();
    expect(result.response.status).toBe(200);
    expect(result.parsed.metrics.totals.processed).toBeGreaterThanOrEqual(1);
    expect(result.parsed.metrics.totals.manualReview).toBeGreaterThanOrEqual(1);
    expect(result.parsed.metrics.totals.suspicious).toBeGreaterThanOrEqual(1);
    expect(result.parsed.metrics.totals.ocrFallback).toBeGreaterThanOrEqual(baselineOcrFallback + 1);
    expect(result.parsed.metrics.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "suspicious_response_patterns", active: true }),
        expect.objectContaining({ key: "classification_uncertainty", count: result.parsed.metrics.totals.manualReview }),
      ]),
    );
    expect(result.parsed.metrics.boundaries).toMatchObject({
      redacted: true,
      structuredOnly: true,
      noRawResponseText: true,
      noCanonicalMutation: true,
      noPacketReadinessMutation: true,
    });
    assertNoSensitiveLeak(result.parsed);

    auth.user = scenario.owner;
    const denied = await metrics();
    expect(denied.response.status).toBe(403);
  });

  it("keeps response capture source boundaries away from parser, OCR, packet, violation, runtime truth, and override paths", () => {
    const source = [
      "helpers/responseDocumentSchema.ts",
      "helpers/responseDocumentService.ts",
      "endpoints/responses/capture_POST.ts",
      "endpoints/responses/list_GET.ts",
      "endpoints/responses/get_GET.ts",
    ]
      .map((path) => readFileSync(resolve(path), "utf8"))
      .join("\n");

    expect(source).not.toMatch(/classifyBureauResponse|record-response|bureau-communication|responseAnalysisPipeline/i);
    expect(source).not.toMatch(/pdfTextExtractor|ocr|deterministicCreditReportPipeline|extractCanonical|parseCreditReport|ingestCorePipeline/i);
    expect(source).not.toMatch(/scanAndPersistViolations|detectViolations|complianceScanner|fireViolation/i);
    expect(source).not.toMatch(/buildSimpleDisputePacketContent|createDisputePacket|generatePacket|generatePacketContentPdfBase64/i);
    expect(source).not.toMatch(/evaluatePacketReadiness|validateDisputePacketReadiness|packetReadiness|packetWording/i);
    expect(source).not.toMatch(/activateRuntime|runtimeBridgeMapping|regulationRuntimeTruth|regulationRegistry/i);
    expect(source).not.toMatch(/adminOverride|direct furnisher|furnisher packet/i);
    expect(source).not.toMatch(/updateTable\("packet"\)|updateTable\("reportArtifact"\)|updateTable\("tradeline"\)|updateTable\("creditorObligationTest"\)|updateTable\("findingOutcome"\)|updateTable\("outcomeComparisonRun"\)/);
  });
});
