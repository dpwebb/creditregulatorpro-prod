import "../../loadEnv.js";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql, type Kysely } from "kysely";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { DB, Json, UserRole } from "../../helpers/schema";
import { NotAuthenticatedError } from "../../helpers/getSetServerSession";
import { RESPONSE_REPLAY_TOOL_VERSION, runResponseProcessingReplay } from "../../helpers/responseReplayService";
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

    const indexes = await sql<{ indexname: string }>`
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'bureau_response_event'
        and indexname = 'idx_bureau_response_event_intake_idempotency_unique'
    `.execute(db);
    expect(indexes.rows.map((row) => row.indexname)).toContain("idx_bureau_response_event_intake_idempotency_unique");
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

  it("captures manual_admin intake, returns classification visibility, and does not log raw response text", async () => {
    const scenario = await createScenario();
    auth.user = scenario.admin;
    const responseTextMarker = "INTAKE_TEXT_MARKER_ALPHA";

    const result = await capture(captureBody({
      intakeSourceType: "manual_admin",
      userId: scenario.owner.id,
      packetId: scenario.packetId,
      responseSource: "manual_admin",
      responseText: `We verified as accurate and the item remains unchanged. ${responseTextMarker}`,
      responseSummary: undefined,
      rawArtifactMetadata: { artifactName: "manual-response.txt", ocrFallbackUsed: false },
      normalizedResponseMetadata: { senderType: "bureau" },
      sourceMetadata: { uiSource: "admin_response_capture", liveMailboxIntegrationUsed: false },
    }));

    expect(result.response.status, JSON.stringify(result.parsed)).toBe(200);
    expect(result.parsed.intake).toMatchObject({
      status: "captured",
      sourceType: "manual_admin",
      duplicateOfResponseId: null,
      responseTextStored: false,
    });
    expect(result.parsed.response).toMatchObject({
      userId: scenario.owner.id,
      packetId: scenario.packetId,
      latestClassification: "remains",
      latestExtractionSource: "deterministic",
      latestRequiresManualReview: true,
    });
    expect(result.parsed.response.normalizedResponseMetadata.intake).toMatchObject({
      sourceType: "manual_admin",
      responseTextStored: false,
      duplicatePolicy: "user_relationship_source_date_text_hash_metadata",
    });
    expect(result.parsed.response.normalizedResponseMetadata.intake.idempotencyKey).toEqual(result.parsed.intake.idempotencyKey);

    const auditRows = await db
      .selectFrom("auditLog")
      .select(["details", "errorMessage"])
      .where("entityType", "=", "SYSTEM")
      .where("entityId", "=", result.parsed.response.id)
      .execute();
    expect(JSON.stringify(auditRows)).not.toContain(responseTextMarker);
    expect(JSON.stringify(auditRows)).toContain("response_intake_captured");
    assertNoSensitiveLeak(auditRows);
  });

  it("supports simulated_inbox intake and returns deterministic completed classification when confidence is sufficient", async () => {
    const scenario = await createScenario();
    auth.user = scenario.admin;

    const result = await capture(captureBody({
      intakeSourceType: "simulated_inbox",
      userId: scenario.owner.id,
      packetId: scenario.packetId,
      responseSource: "simulated_inbox",
      responseText: "We are unable to verify the disputed item after reinvestigation.",
      responseSummary: undefined,
      rawArtifactMetadata: { artifactName: "simulated-inbox-message.eml", ocrFallbackUsed: false },
      normalizedResponseMetadata: { senderType: "bureau", simulated: true },
      sourceMessageId: "simulated-message-001",
      sourceMetadata: { sourceHarness: "synthetic_simulated_inbox", liveMailboxIntegrationUsed: false },
    }));

    expect(result.response.status, JSON.stringify(result.parsed)).toBe(200);
    expect(result.parsed.intake).toMatchObject({
      status: "captured",
      sourceType: "simulated_inbox",
      responseTextStored: false,
    });
    expect(result.parsed.response.latestProcessingEvent).toMatchObject({
      classification: "unable_to_verify",
      extractionSource: "deterministic",
      requiresManualReview: false,
      packetId: scenario.packetId,
      violationId: scenario.findingId,
      tradelineId: scenario.tradelineId,
    });
    assertNoSensitiveLeak(result.parsed);
  });

  it("supports future_mailbox as an inert normalized source without live mailbox integration", async () => {
    const scenario = await createScenario();
    auth.user = scenario.admin;

    const result = await capture(captureBody({
      intakeSourceType: "future_mailbox",
      userId: scenario.owner.id,
      packetId: scenario.packetId,
      responseSource: "future_mailbox",
      responseText: "We are unable to verify the disputed item after reinvestigation.",
      responseSummary: undefined,
      sourceMessageId: "future-mailbox-placeholder-001",
      sourceMetadata: {
        sourceBoundary: "inert_placeholder",
        liveMailboxIntegrationUsed: false,
      },
    }));

    expect(result.response.status, JSON.stringify(result.parsed)).toBe(200);
    expect(result.parsed.intake).toMatchObject({
      status: "captured",
      sourceType: "future_mailbox",
      responseTextStored: false,
    });
    expect(result.parsed.response).toMatchObject({
      responseSource: "future_mailbox",
      latestExtractionSource: "deterministic",
    });
    expect(result.parsed.response.rawArtifactMetadata.intakeArtifact).toMatchObject({
      sourceType: "future_mailbox",
      responseTextStored: false,
    });
    expect(result.parsed.response.normalizedResponseMetadata.sourceMetadata).toMatchObject({
      liveMailboxIntegrationUsed: false,
    });
    assertNoSensitiveLeak(result.parsed);
  });

  it("deduplicates identical intake attempts while allowing meaningful metadata differences", async () => {
    const scenario = await createScenario();
    auth.user = scenario.admin;
    const body = captureBody({
      intakeSourceType: "manual_admin",
      userId: scenario.owner.id,
      packetId: scenario.packetId,
      responseSource: "manual_admin",
      responseReceivedAt: "2026-05-18T00:00:00.000Z",
      responseText: "We verified as accurate and the item remains unchanged.",
      responseSummary: undefined,
      rawArtifactMetadata: { artifactName: "manual-response.txt", artifactSha256: "c".repeat(64) },
      normalizedResponseMetadata: { senderType: "bureau", flags: { second: true, first: false } },
      sourceMetadata: { captureMode: "manual", preserveOrder: true },
    });

    const first = await capture(body);
    const duplicate = await capture(body);
    const reorderedDuplicate = await capture({
      ...body,
      rawArtifactMetadata: { artifactSha256: "c".repeat(64), artifactName: "manual-response.txt" },
      normalizedResponseMetadata: { flags: { first: false, second: true }, senderType: "bureau" },
      sourceMetadata: { preserveOrder: true, captureMode: "manual" },
    });
    const differentMetadata = await capture({
      ...body,
      rawArtifactMetadata: { artifactName: "manual-response-second-copy.txt", artifactSha256: "d".repeat(64) },
    });

    expect(first.response.status).toBe(200);
    expect(duplicate.response.status).toBe(200);
    expect(differentMetadata.response.status).toBe(200);
    expect(duplicate.parsed.intake).toMatchObject({
      status: "duplicate",
      duplicateOfResponseId: first.parsed.response.id,
      idempotencyKey: first.parsed.intake.idempotencyKey,
    });
    expect(reorderedDuplicate.parsed.intake).toMatchObject({
      status: "duplicate",
      duplicateOfResponseId: first.parsed.response.id,
      idempotencyKey: first.parsed.intake.idempotencyKey,
    });
    expect(duplicate.parsed.response.id).toBe(first.parsed.response.id);
    expect(reorderedDuplicate.parsed.response.id).toBe(first.parsed.response.id);
    expect(differentMetadata.parsed.intake.status).toBe("captured");
    expect(differentMetadata.parsed.response.id).not.toBe(first.parsed.response.id);

    const duplicateAudit = await db
      .selectFrom("auditLog")
      .select("details")
      .where("entityType", "=", "SYSTEM")
      .where("entityId", "=", first.parsed.response.id)
      .execute();
    expect(JSON.stringify(duplicateAudit)).toContain("response_intake_duplicate");
    assertNoSensitiveLeak(duplicateAudit);
  });

  it("does not over-collapse packetless intake when meaningful relationship or subject scope differs", async () => {
    const scenario = await createScenario();
    auth.user = scenario.admin;
    const secondBureauId = await createBureau(`TransUnion ${marker()}`);
    const body = captureBody({
      intakeSourceType: "manual_admin",
      userId: scenario.owner.id,
      packetId: null,
      bureauId: scenario.bureauId,
      responseSource: "manual_admin",
      responseReceivedAt: "2026-05-18T00:00:00.000Z",
      responseSubject: "Synthetic response scope A",
      responseSenderDomain: null,
      responseReferenceId: null,
      responseText: "We verified as accurate and the item remains unchanged.",
      responseSummary: undefined,
      rawArtifactMetadata: { artifactName: "manual-packetless-response.txt", artifactSha256: "e".repeat(64) },
      normalizedResponseMetadata: { senderType: "bureau" },
      sourceMetadata: { captureMode: "manual" },
    });

    const first = await capture(body);
    const duplicate = await capture(body);
    const differentBureau = await capture({
      ...body,
      bureauId: secondBureauId,
    });
    const differentSubject = await capture({
      ...body,
      responseSubject: "Synthetic response scope B",
    });

    expect(first.response.status).toBe(200);
    expect(duplicate.parsed.intake).toMatchObject({
      status: "duplicate",
      duplicateOfResponseId: first.parsed.response.id,
    });
    expect(differentBureau.response.status).toBe(200);
    expect(differentBureau.parsed.intake.status).toBe("captured");
    expect(differentBureau.parsed.response.id).not.toBe(first.parsed.response.id);
    expect(differentSubject.response.status).toBe(200);
    expect(differentSubject.parsed.intake.status).toBe("captured");
    expect(differentSubject.parsed.response.id).not.toBe(first.parsed.response.id);
    assertNoSensitiveLeak([first.parsed, duplicate.parsed, differentBureau.parsed, differentSubject.parsed]);
  });

  it("uses the idempotency index to collapse concurrent duplicate intake submissions", async () => {
    const scenario = await createScenario();
    auth.user = scenario.admin;
    const body = captureBody({
      intakeSourceType: "manual_admin",
      userId: scenario.owner.id,
      packetId: scenario.packetId,
      responseSource: "manual_admin",
      responseReceivedAt: "2026-05-18T00:00:00.000Z",
      responseText: "We verified as accurate and the item remains unchanged.",
      responseSummary: undefined,
      rawArtifactMetadata: { artifactName: "concurrent-response.txt", artifactSha256: "f".repeat(64) },
      normalizedResponseMetadata: { senderType: "bureau", concurrency: true },
      sourceMetadata: { captureMode: "manual" },
    });

    const [left, right] = await Promise.all([capture(body), capture(body)]);
    expect(left.response.status).toBe(200);
    expect(right.response.status).toBe(200);
    const results = [left.parsed, right.parsed];
    expect(results.map((item) => item.intake.status).sort()).toEqual(["captured", "duplicate"]);
    const captured = results.find((item) => item.intake.status === "captured");
    const duplicate = results.find((item) => item.intake.status === "duplicate");
    expect(captured).toBeDefined();
    expect(duplicate).toBeDefined();
    expect(duplicate?.response.id).toBe(captured?.response.id);
    expect(duplicate?.intake.duplicateOfResponseId).toBe(captured?.response.id);

    const rows = await sql<{ count: string }>`
      select count(*)::text as count
      from public.bureau_response_event
      where normalized_response_metadata #>> '{intake,idempotencyKey}' = ${captured?.intake.idempotencyKey}
    `.execute(db);
    expect(Number(rows.rows[0]?.count ?? 0)).toBe(1);
    assertNoSensitiveLeak(results);
  });

  it("rejects malformed intake without leaking unsafe response text", async () => {
    const scenario = await createScenario();
    auth.user = scenario.admin;

    const missingText = await capture(captureBody({
      intakeSourceType: "manual_admin",
      userId: scenario.owner.id,
      packetId: scenario.packetId,
      responseText: "",
      responseSummary: undefined,
    }));
    expect(missingText.response.status).toBe(400);
    expect(JSON.stringify(missingText.parsed)).toContain("requires response text");

    const unsafeText = await capture(captureBody({
      intakeSourceType: "manual_admin",
      userId: scenario.owner.id,
      packetId: scenario.packetId,
      responseText: "Full SIN 123-456-789",
      responseSummary: undefined,
    }));
    expect(unsafeText.response.status).toBe(400);
    expect(JSON.stringify(unsafeText.parsed)).not.toContain("123-456-789");
    assertNoSensitiveLeak(unsafeText.parsed);

    auth.user = scenario.owner;
    const userAttempt = await capture(captureBody({
      intakeSourceType: "manual_admin",
      packetId: scenario.packetId,
      responseText: "We verified as accurate.",
      responseSummary: undefined,
    }));
    expect(userAttempt.response.status).toBe(403);
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
    expect(result.parsed.metrics.replayReadiness).toMatchObject({
      totalResponseRecords: expect.any(Number),
      replayableRecords: expect.any(Number),
      nonReplayableRecords: expect.any(Number),
      staleOrMissingClassifierMetadata: expect.any(Number),
      missingProcessingSummary: expect.any(Number),
      manualReviewRequired: expect.any(Number),
      uncertainty: expect.any(Number),
      duplicateAttemptAudits: expect.any(Number),
      lastReplayDryRunAt: null,
      boundaries: {
        noRawResponseText: true,
        dryRunDoesNotPersist: true,
        applyIsAppendOnly: true,
        liveMailboxIntegrationUsed: false,
      },
    });
    expect(result.parsed.metrics.queueHealth).toMatchObject({
      totalJobs: expect.any(Number),
      queuedJobs: expect.any(Number),
      runningJobs: expect.any(Number),
      succeededJobs: expect.any(Number),
      failedJobs: expect.any(Number),
      deadLetteredJobs: expect.any(Number),
      staleRunningJobs: expect.any(Number),
      retryBacklogJobs: expect.any(Number),
      duplicateEnqueueAttempts: expect.any(Number),
      deadLetterAcknowledgedJobs: expect.any(Number),
      staleRunningReviewedJobs: expect.any(Number),
      replacementJobs: expect.any(Number),
      boundaries: {
        durableDbBacked: true,
        appendOnlyJobEvents: true,
        noRawResponseText: true,
        noSecretsInPayload: true,
        liveMailboxIntegrationUsed: false,
        externalAlertDeliveryUsed: false,
        canonicalFactsMutated: false,
        violationTruthMutated: false,
        packetReadinessMutated: false,
      },
    });
    assertNoSensitiveLeak(result.parsed);

    auth.user = scenario.owner;
    const denied = await metrics();
    expect(denied.response.status).toBe(403);
  });

  it("runs response replay dry-run on empty filters without mutating processing events", async () => {
    const result = await runResponseProcessingReplay({
      filters: {
        responseId: 999_999_999,
        limit: 10,
      },
    });

    expect(result.mode).toBe("dry_run");
    expect(result.totals).toMatchObject({
      scanned: 0,
      replayable: 0,
      nonReplayable: 0,
      appendedProcessingEvents: 0,
    });
    expect(result.boundaries).toMatchObject({
      noRawResponseTextStored: true,
      noRawResponseTextLogged: true,
      liveMailboxIntegrationUsed: false,
    });
    assertNoSensitiveLeak(result);
  });

  it("reports replay dry-run, stale metadata, non-replayable records, and append-only apply behavior", async () => {
    const scenario = await createScenario();
    auth.user = scenario.admin;

    const replayableCapture = await capture(captureBody({
      intakeSourceType: "manual_admin",
      userId: scenario.owner.id,
      packetId: scenario.packetId,
      responseSource: "manual_admin",
      responseText: "We verified as accurate and the item remains unchanged.",
      responseSummary: undefined,
      rawArtifactMetadata: { artifactName: "replay-response.txt", artifactSha256: "a".repeat(64) },
      normalizedResponseMetadata: { senderType: "bureau", replayFixture: true },
      sourceMetadata: { replayHarness: true },
    }));
    if (!replayableCapture.parsed.response?.id) {
      throw new Error(`Synthetic replay capture failed with status ${replayableCapture.response.status}: ${String(replayableCapture.parsed.error ?? "missing sanitized response")}`);
    }
    const replayableId = Number(replayableCapture.parsed.response.id);
    await sql`
      update public.response_processing_event
      set parser_version = 'response-document-parser-old-version'
      where response_event_id = ${replayableId}
    `.execute(db);

    const beforeProcessing = await sql<{ count: string }>`
      select count(*)::text as count
      from public.response_processing_event
      where response_event_id = ${replayableId}
    `.execute(db);
    const originalResponse = await db
      .selectFrom("bureauResponseEvent")
      .select(["rawArtifactMetadata", "normalizedResponseMetadata", "latestProcessingEventId", "latestClassification"])
      .where("id", "=", replayableId)
      .executeTakeFirstOrThrow();

    const dryRun = await runResponseProcessingReplay({ filters: { responseId: replayableId } });
    expect(dryRun.mode).toBe("dry_run");
    expect(dryRun.totals).toMatchObject({
      scanned: 1,
      replayable: 1,
      nonReplayable: 0,
      staleOrMissingClassifierMetadata: 1,
      appendedProcessingEvents: 0,
    });
    expect(dryRun.records[0]).toMatchObject({
      responseId: replayableId,
      replayable: true,
      replayClassification: "remains",
      latestParserVersion: "response-document-parser-old-version",
      staleClassifierMetadata: true,
      wouldAppendProcessingEvent: true,
      appendedProcessingEventId: null,
    });

    const afterDryRunProcessing = await sql<{ count: string }>`
      select count(*)::text as count
      from public.response_processing_event
      where response_event_id = ${replayableId}
    `.execute(db);
    expect(afterDryRunProcessing.rows[0]?.count).toBe(beforeProcessing.rows[0]?.count);

    await expect(runResponseProcessingReplay({
      mode: "apply",
      actorUserId: scenario.admin.id,
      filters: { responseId: replayableId },
    })).rejects.toThrow(/confirmApply/i);

    await expect(runResponseProcessingReplay({
      mode: "apply",
      confirmApply: true,
      filters: { responseId: replayableId },
    })).rejects.toThrow(/actorUserId/i);

    await expect(runResponseProcessingReplay({
      filters: { classification: "unsupported_response_state" as any },
    })).rejects.toThrow(/classification/i);

    await expect(runResponseProcessingReplay({
      filters: { startDate: "not-a-date" },
    })).rejects.toThrow(/valid date/i);

    const apply = await runResponseProcessingReplay({
      mode: "apply",
      confirmApply: true,
      actorUserId: scenario.admin.id,
      filters: { responseId: replayableId },
    });
    expect(apply.totals.appendedProcessingEvents).toBe(1);
    expect(apply.records[0]?.appendedProcessingEventId).toEqual(expect.any(Number));

    const afterApplyProcessing = await sql<{ count: string }>`
      select count(*)::text as count
      from public.response_processing_event
      where response_event_id = ${replayableId}
    `.execute(db);
    expect(Number(afterApplyProcessing.rows[0]?.count ?? 0)).toBe(Number(beforeProcessing.rows[0]?.count ?? 0) + 1);

    const unchangedResponse = await db
      .selectFrom("bureauResponseEvent")
      .select(["rawArtifactMetadata", "normalizedResponseMetadata", "latestProcessingEventId", "latestClassification"])
      .where("id", "=", replayableId)
      .executeTakeFirstOrThrow();
    expect(unchangedResponse).toEqual(originalResponse);

    const replayEvent = await sql<any>`
      select normalized_response_metadata, deterministic_extraction
      from public.response_processing_event
      where id = ${apply.records[0]?.appendedProcessingEventId}
    `.execute(db);
    const replayEventMetadataValue =
      replayEvent.rows[0]?.normalized_response_metadata ?? replayEvent.rows[0]?.normalizedResponseMetadata;
    const replayEventMetadata =
      typeof replayEventMetadataValue === "string" ? JSON.parse(replayEventMetadataValue) : replayEventMetadataValue;
    expect(replayEventMetadata?.replay).toMatchObject({
      replaySource: RESPONSE_REPLAY_TOOL_VERSION,
      replayMode: "apply",
      actorUserId: scenario.admin.id,
      responseTextStored: false,
    });
    const deterministicExtractionValue =
      replayEvent.rows[0]?.deterministic_extraction ?? replayEvent.rows[0]?.deterministicExtraction;
    const deterministicExtraction =
      typeof deterministicExtractionValue === "string" ? JSON.parse(deterministicExtractionValue) : deterministicExtractionValue;
    expect(deterministicExtraction).toMatchObject({
      replaySource: RESPONSE_REPLAY_TOOL_VERSION,
      replayMode: "apply",
      replayActorUserId: scenario.admin.id,
    });

    const audit = await db
      .selectFrom("auditLog")
      .select(["actionType", "details"])
      .where("entityType", "=", "SYSTEM")
      .where("entityId", "=", replayableId)
      .execute();
    expect(JSON.stringify(audit)).toContain("response_processing_replay_applied");
    assertNoSensitiveLeak([dryRun, apply, audit, replayEvent.rows]);

    const nonReplayable = await capture(captureBody({
      userId: scenario.owner.id,
      packetId: scenario.packetId,
      responseSummary: null,
      normalizedResponseMetadata: { intake: { responseTextStored: false, responseTextHash: "b".repeat(64) } },
    }));
    if (!nonReplayable.parsed.response?.id) {
      throw new Error(`Synthetic non-replayable capture failed with status ${nonReplayable.response.status}: ${String(nonReplayable.parsed.error ?? "missing sanitized response")}`);
    }
    const nonReplayableId = Number(nonReplayable.parsed.response.id);
    const nonReplayableRun = await runResponseProcessingReplay({ filters: { responseId: nonReplayableId } });
    expect(nonReplayableRun.records[0]).toMatchObject({
      responseId: nonReplayableId,
      replayable: false,
      nonReplayableReason: "raw_response_text_not_stored",
      replayClassification: null,
    });
    expect(nonReplayableRun.totals.appendedProcessingEvents).toBe(0);
    assertNoSensitiveLeak(nonReplayableRun);
  });

  it("keeps response capture source boundaries away from parser, OCR, packet, violation, runtime truth, and override paths", () => {
    const source = [
      "helpers/responseDocumentSchema.ts",
      "helpers/responseDocumentService.ts",
      "helpers/responseIntakeService.ts",
      "helpers/responseReplayService.ts",
      "helpers/responseProcessingQueueService.ts",
      "endpoints/responses/capture_POST.ts",
      "endpoints/responses/list_GET.ts",
      "endpoints/responses/get_GET.ts",
      "scripts/response-processing-replay.ts",
    ]
      .map((path) => readFileSync(resolve(path), "utf8"))
      .join("\n");

    expect(source).not.toMatch(/classifyBureauResponse|record-response|bureau-communication|responseAnalysisPipeline/i);
    expect(source).not.toMatch(/pdfTextExtractor|ocr|deterministicCreditReportPipeline|extractCanonical|parseCreditReport|ingestCorePipeline/i);
    expect(source).not.toMatch(/scanAndPersistViolations|detectViolations|complianceScanner|fireViolation/i);
    expect(source).not.toMatch(/buildSimpleDisputePacketContent|createDisputePacket|generatePacket|generatePacketContentPdfBase64/i);
    expect(source).not.toMatch(/evaluatePacketReadiness|validateDisputePacketReadiness|packetWording/i);
    expect(source).not.toMatch(/activateRuntime|runtimeBridgeMapping|regulationRuntimeTruth|regulationRegistry/i);
    expect(source).not.toMatch(/adminOverride|direct furnisher|furnisher packet/i);
    expect(source).not.toMatch(/updateTable\("packet"\)|updateTable\("reportArtifact"\)|updateTable\("tradeline"\)|updateTable\("creditorObligationTest"\)|updateTable\("findingOutcome"\)|updateTable\("outcomeComparisonRun"\)/);
  });
});
