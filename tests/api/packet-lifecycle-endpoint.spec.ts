import "../../loadEnv.js";

import { sql, type Kysely } from "kysely";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { DB } from "../../helpers/schema";
import type { User } from "../../helpers/User";
import { ensureConsumerIdentificationSchema } from "../../helpers/consumerIdentification";
import { buildSimpleDisputePacketContent } from "../../helpers/disputePacketTemplate";
import { assertSafeLocalDatabaseUrl } from "../utils/localDbHarness";

type EndpointHandle = (request: Request) => Promise<Response>;
type AuthUser = User;

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
const requestOrigin = "https://staging.creditregulatorpro.com";
const reportDate = new Date("2026-05-11T00:00:00.000Z");
const testTermsVersion = "pkt-life-test";

let db: Kysely<DB>;
let validateReadiness: EndpointHandle;
let buildPacket: EndpointHandle;
let createPacket: EndpointHandle;
let getPacketPdf: EndpointHandle;
let getPacket: EndpointHandle;
let listPackets: EndpointHandle;

const created = {
  userIds: [] as number[],
  userAccountIds: [] as number[],
  bureauIds: [] as number[],
  creditorIds: [] as number[],
  reportArtifactIds: [] as number[],
  tradelineIds: [] as number[],
  issueIds: [] as number[],
  packetIds: [] as number[],
};

function track<T>(items: T[], value: T): T {
  items.push(value);
  return value;
}

function syntheticMarker(): string {
  return `packet-lifecycle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function authUserFromRow(row: {
  id: number;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  organizationId: number | null;
  emailVerified: boolean;
  role: "admin" | "support" | "user";
}): AuthUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    organizationId: row.organizationId,
    emailVerified: row.emailVerified,
    role: row.role,
    subscriptionPlan: null,
    subscriptionStatus: null,
    trialEnd: null,
    termsAcceptedAt: reportDate.toISOString(),
    termsAcceptedVersion: testTermsVersion,
    currentTermsVersion: testTermsVersion,
  };
}

function postRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: requestOrigin,
    },
    body: JSON.stringify(body),
  });
}

function pdfRequest(packetId: number): Request {
  return new Request(`http://localhost/_api/packet/pdf?packetId=${packetId}`, {
    method: "GET",
    headers: {
      Origin: requestOrigin,
    },
  });
}

function getRequest(path: string): Request {
  return new Request(`http://localhost${path}`, {
    method: "GET",
    headers: {
      Origin: requestOrigin,
    },
  });
}

function jsonValue<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

function idText(value: unknown): string {
  return String(value);
}

function sortedIdTexts(values: unknown[]): string[] {
  return values.map(idText).sort();
}

async function cleanupCreatedRows(): Promise<void> {
  if (!db) return;

  const packetIds = Array.from(new Set(created.packetIds));
  const issueIds = Array.from(new Set(created.issueIds));
  const tradelineIds = Array.from(new Set(created.tradelineIds));
  const reportArtifactIds = Array.from(new Set(created.reportArtifactIds));
  const creditorIds = Array.from(new Set(created.creditorIds));
  const bureauIds = Array.from(new Set(created.bureauIds));
  const userIds = Array.from(new Set(created.userIds));
  const userAccountIds = Array.from(new Set(created.userAccountIds));

  if (packetIds.length > 0) {
    await db.deleteFrom("disputePacketFindings").where("disputePacketId", "in", packetIds).execute();
    await db.deleteFrom("packetComplianceAudit").where("packetId", "in", packetIds).execute();
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
    await db.deleteFrom("reportArtifact").where("id", "in", reportArtifactIds).execute();
  }

  if (creditorIds.length > 0) {
    await db.deleteFrom("creditor").where("id", "in", creditorIds).execute();
  }

  if (bureauIds.length > 0) {
    await db.deleteFrom("bureau").where("id", "in", bureauIds).execute();
  }

  if (userIds.length > 0) {
    await db.deleteFrom("auditLog").where("userId", "in", userIds).execute();
  }

  if (userAccountIds.length > 0) {
    await db.deleteFrom("userAccount").where("id", "in", userAccountIds).execute();
  }

  if (userIds.length > 0) {
    await db.deleteFrom("users").where("id", "in", userIds).execute();
  }

  created.userIds = [];
  created.userAccountIds = [];
  created.bureauIds = [];
  created.creditorIds = [];
  created.reportArtifactIds = [];
  created.tradelineIds = [];
  created.issueIds = [];
  created.packetIds = [];
}

async function createFixtureUser(
  marker: string,
  label: string,
  role: "admin" | "support" | "user" = "user",
): Promise<AuthUser> {
  const row = await db
    .insertInto("users")
    .values({
      email: `${marker}-${label}@example.test`,
      displayName: `Packet Lifecycle ${label}`,
      avatarUrl: null,
      organizationId: null,
      role,
      emailVerified: true,
    })
    .returning(["id", "email", "displayName", "avatarUrl", "organizationId", "emailVerified", "role"])
    .executeTakeFirstOrThrow();
  track(created.userIds, row.id);

  const account = await db
    .insertInto("userAccount")
    .values({
      userId: row.id,
      email: row.email,
      fullName: `Packet Lifecycle ${label}`,
      addressLine1: "100 Synthetic Test Avenue",
      addressLine2: null,
      city: "Halifax",
      province: "NS",
      postalCode: "B3J 0A1",
      phone: "555-0100",
      role,
      dateOfBirth: null,
      legalNameSignature: null,
      termsAcceptedAt: reportDate,
      termsAcceptedVersion: testTermsVersion,
      region: "CA",
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  track(created.userAccountIds, account.id);

  return authUserFromRow(row);
}

async function createPacketSourceFixture(owner: AuthUser, marker: string) {
  const balanceEvidenceId = `evidence-${marker}-balance`;
  const statusEvidenceId = `evidence-${marker}-status`;
  const balanceEvidenceSnippet =
    "Synthetic source report line: balance field reports 200 while expected balance is 100.";
  const statusEvidenceSnippet =
    "Synthetic source report line: account status field reports Open while expected status is Closed.";
  const bureau = await db
    .insertInto("bureau")
    .values({
      name: `Synthetic Bureau ${marker}`,
      address: null,
      addressLine1: "200 Bureau Test Street",
      addressLine2: null,
      city: "Toronto",
      province: "ON",
      postalCode: "M5J 2N8",
      contactEmail: null,
      contactPhone: null,
      region: "CA",
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  track(created.bureauIds, bureau.id);

  const creditor = await db
    .insertInto("creditor")
    .values({
      name: `Synthetic Creditor ${marker}`,
      address: null,
      contactEmail: null,
      contactPhone: null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  track(created.creditorIds, creditor.id);

  const reportArtifact = await db
    .insertInto("reportArtifact")
    .values({
      userId: owner.id,
      artifactType: "packet_lifecycle_endpoint_test",
      processingStatus: "completed",
      data: {
        marker,
        synthetic: true,
        evidenceLocationIndex: {
          [balanceEvidenceId]: {
            evidenceId: balanceEvidenceId,
            fieldKey: "tradelines[0].balance",
            sourceField: "pdf_text.parseResult.tradelines[0].balance",
            sourceMethod: "pdf_text",
            extractionMethod: "native_pdf_text",
            pageNumber: 2,
            sectionName: "tradeline_accounts",
            zoneName: "tradeline_accounts",
            textSnippet: balanceEvidenceSnippet,
            tokenIndexes: [12, 13, 14],
            boundingBox: {
              x: 100,
              y: 200,
              width: 90,
              height: 12,
              unit: "pt",
              pageNumber: 2,
              coordinateSource: "pdfjs_text_item",
              coordinateValidated: true,
            },
            itemSpanIndexes: [12, 13],
            coordinateExtractorVersion: "pdfjs-coordinate-extractor-v1",
            ruleId: "canonical-field-selected-v1",
            confidence: 1,
            provenance: {
              deterministicPipelineVersion: "test-v1",
              documentBinarySha256: "synthetic-document-sha",
              rawTextSha256: "synthetic-raw-text-sha",
              canonicalResultSha256: "synthetic-canonical-sha",
              replayHash: "synthetic-replay-hash",
            },
          },
          [statusEvidenceId]: {
            evidenceId: statusEvidenceId,
            fieldKey: "tradelines[0].status",
            sourceField: "pdf_text.parseResult.tradelines[0].status",
            sourceMethod: "pdf_text",
            extractionMethod: "native_pdf_text",
            pageNumber: 2,
            sectionName: "tradeline_accounts",
            zoneName: "tradeline_accounts",
            textSnippet: statusEvidenceSnippet,
            tokenIndexes: [20, 21],
            boundingBox: {
              x: 100,
              y: 226,
              width: 68,
              height: 12,
              unit: "pt",
              pageNumber: 2,
              coordinateSource: "pdfjs_text_item",
              coordinateValidated: true,
            },
            itemSpanIndexes: [20],
            coordinateExtractorVersion: "pdfjs-coordinate-extractor-v1",
            ruleId: "canonical-field-selected-v1",
            confidence: 1,
            provenance: {
              deterministicPipelineVersion: "test-v1",
              documentBinarySha256: "synthetic-document-sha",
              rawTextSha256: "synthetic-raw-text-sha",
              canonicalResultSha256: "synthetic-canonical-sha",
              replayHash: "synthetic-replay-hash",
            },
          },
        },
      },
      reportDate,
      storageUrl: null,
      sha256: null,
      tradelineId: null,
      organizationId: null,
      expiresAt: null,
      metro2Version: null,
      crrgYear: null,
      validationRulesApplied: null,
      region: "CA",
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  track(created.reportArtifactIds, reportArtifact.id);

  const readyTradeline = await db
    .insertInto("tradeline")
    .values({
      userId: owner.id,
      bureauId: bureau.id,
      creditorId: creditor.id,
      reportArtifactId: reportArtifact.id,
      accountNumber: `ACCT-${marker}-READY`,
      accountType: "Credit card",
      status: "Open",
      balance: 200,
      currentBalance: 200,
      creditLimit: 1000,
      highCredit: 500,
      amountPastDue: 0,
      openedDate: new Date("2024-01-15T00:00:00.000Z"),
      lastReportedDate: reportDate,
      sourceText: balanceEvidenceSnippet,
      originalCreditorName: null,
      collectionAgencyName: null,
      isCollectionAccount: false,
      organizationId: null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  track(created.tradelineIds, readyTradeline.id);

  const blockedTradeline = await db
    .insertInto("tradeline")
    .values({
      userId: owner.id,
      bureauId: bureau.id,
      creditorId: creditor.id,
      reportArtifactId: null,
      accountNumber: `ACCT-${marker}-BLOCKED`,
      accountType: "Credit card",
      status: "Open",
      sourceText: null,
      originalCreditorName: null,
      collectionAgencyName: null,
      isCollectionAccount: false,
      organizationId: null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  track(created.tradelineIds, blockedTradeline.id);

  const readyIssue = await insertFinding({
    tradelineId: readyTradeline.id,
    creditorId: creditor.id,
    technicalDetails: {
      fieldName: "balance",
      reportedValue: "$200",
      expectedValue: "$100",
      evidenceLink: {
        reportArtifactId: reportArtifact.id,
        evidenceId: balanceEvidenceId,
        field: "balance",
        pageNumber: 2,
        textSnippet: balanceEvidenceSnippet,
      },
      extractionConfidenceGate: {
        status: "confirmed",
        packetReady: true,
        confidenceScore: 95,
        requiresManualReview: false,
        reasonCodes: [],
      },
    },
  });

  const secondaryReadyIssue = await insertFinding({
    tradelineId: readyTradeline.id,
    creditorId: creditor.id,
    technicalDetails: {
      fieldName: "status",
      reportedValue: "Open",
      expectedValue: "Closed",
      evidenceLink: {
        reportArtifactId: reportArtifact.id,
        evidenceId: statusEvidenceId,
        field: "status",
        pageNumber: 2,
        textSnippet: statusEvidenceSnippet,
      },
      extractionConfidenceGate: {
        status: "confirmed",
        packetReady: true,
        confidenceScore: 95,
        requiresManualReview: false,
        reasonCodes: [],
      },
    },
  });

  const blockedIssue = await insertFinding({
    tradelineId: blockedTradeline.id,
    creditorId: creditor.id,
    technicalDetails: {
      fieldName: "balance",
      reportedValue: "$200",
      expectedValue: "$100",
      extractionConfidenceGate: {
        status: "confirmed",
        packetReady: true,
        confidenceScore: 95,
        requiresManualReview: false,
        reasonCodes: [],
      },
    },
  });

  const dismissedIssue = await insertFinding({
    tradelineId: readyTradeline.id,
    creditorId: creditor.id,
    userStatus: "dismissed",
    technicalDetails: {
      fieldName: "status",
      reportedValue: "Open",
      expectedValue: "Closed",
      evidenceLink: {
        reportArtifactId: reportArtifact.id,
        field: "status",
        pageNumber: 3,
        textSnippet: "Synthetic source report line: status field is disputed for packet readiness only.",
      },
      extractionConfidenceGate: {
        status: "confirmed",
        packetReady: true,
        confidenceScore: 95,
        requiresManualReview: false,
        reasonCodes: [],
      },
    },
  });

  return {
    bureauId: bureau.id,
    readyIssueId: readyIssue,
    secondaryReadyIssueId: secondaryReadyIssue,
    blockedIssueId: blockedIssue,
    dismissedIssueId: dismissedIssue,
    balanceEvidenceId,
    statusEvidenceId,
  };
}

async function insertFinding(input: {
  tradelineId: number;
  creditorId: number;
  technicalDetails: Record<string, unknown>;
  userStatus?: "active" | "dismissed" | "verified";
}): Promise<number> {
  const issue = await db
    .insertInto("creditorObligationTest")
    .values({
      tradelineId: input.tradelineId,
      creditorId: input.creditorId,
      obligationType: "ACCURACY_INTEGRITY",
      violationCategory: "BALANCE_CALCULATION_VIOLATION",
      severity: "WARNING",
      confidenceScore: 95,
      userExplanation: "Synthetic packet lifecycle finding for endpoint regression coverage.",
      technicalDetails: input.technicalDetails,
      recommendedAction: "Review the synthetic source-report evidence and correct the reported field.",
      validationStatus: "PENDING",
      obligationState: "OBLIGATION_PENDING",
      autoGenerated: true,
      detectedAt: reportDate,
      createdAt: reportDate,
      updatedAt: reportDate,
      userStatus: input.userStatus ?? "active",
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return track(created.issueIds, issue.id);
}

describeIfLocalDb("packet lifecycle endpoints", () => {
  beforeAll(async () => {
    db = (await import("../../helpers/db")).db;
    await (await import("../../helpers/disputePacketFindingsSchema")).ensureDisputePacketFindingsSchema();
    validateReadiness = (await import("../../endpoints/packet/validate-readiness_POST")).handle;
    buildPacket = (await import("../../endpoints/packet/build_POST")).handle;
    createPacket = (await import("../../endpoints/packet/create_POST")).handle;
    getPacketPdf = (await import("../../endpoints/packet/pdf_GET")).handle;
    getPacket = (await import("../../endpoints/packet/get_GET")).handle;
    listPackets = (await import("../../endpoints/packet/list_GET")).handle;
  });

  afterEach(async () => {
    auth.user = null;
    await cleanupCreatedRows();
  });

  afterAll(async () => {
    await db?.destroy();
  });

  it("has the additive dispute_packet_findings table, constraints, and indexes", async () => {
    const table = await sql<{ tableName: string | null }>`
      select to_regclass('public.dispute_packet_findings')::text as "tableName"
    `.execute(db);
    expect(table.rows[0]?.tableName).toBe("dispute_packet_findings");

    const constraints = await sql<{ conname: string; contype: string }>`
      select conname, contype
      from pg_constraint
      where conrelid = 'public.dispute_packet_findings'::regclass
    `.execute(db);
    const constraintNames = constraints.rows.map((row) => row.conname);
    expect(constraintNames).toEqual(
      expect.arrayContaining([
        "dispute_packet_findings_packet_finding_unique",
        "dispute_packet_findings_packet_id_fkey",
        "dispute_packet_findings_creditor_obligation_test_id_fkey",
      ]),
    );
    expect(constraints.rows.filter((row) => row.contype === "f").length).toBeGreaterThanOrEqual(6);

    const indexes = await sql<{ indexname: string }>`
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'dispute_packet_findings'
    `.execute(db);
    expect(indexes.rows.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        "idx_dispute_packet_findings_creditor_obligation_test_id",
        "idx_dispute_packet_findings_dispute_packet_id",
        "idx_dispute_packet_findings_user_created_at",
        "idx_dispute_packet_findings_tradeline_created_at",
        "idx_dispute_packet_findings_report_artifact_id",
        "idx_dispute_packet_findings_bureau_id",
      ]),
    );
  });

  it("runs readiness, build, create, PDF download, and non-owner denial through endpoint handlers", async () => {
    const marker = syntheticMarker();
    const owner = await createFixtureUser(marker, "owner");
    const nonOwner = await createFixtureUser(marker, "non-owner");
    const fixture = await createPacketSourceFixture(owner, marker);
    const requestBody = {
      packetType: "credit_bureau",
      selectedIssueIds: [fixture.readyIssueId],
      recipientBureauId: fixture.bureauId,
    };

    auth.user = owner;
    const readinessResponse = await validateReadiness(postRequest("/_api/packet/validate-readiness", requestBody));
    expect(readinessResponse.status).toBe(200);
    const readiness = await readinessResponse.json();
    expect(readiness.packetReady).toBe(true);
    expect(readiness.eligibleFindingIds).toContain(fixture.readyIssueId);
    expect(readiness.ineligibleFindingIds).not.toContain(fixture.readyIssueId);
    expect(readiness.reasonCodes).toEqual([]);

    const buildResponse = await buildPacket(postRequest("/_api/packet/build", requestBody));
    expect(buildResponse.status).toBe(200);
    const built = await buildResponse.json();
    expect(built.packet.packetType).toBe("credit_bureau");
    expect(["credit_bureau", "collection_agency"]).toContain(built.packet.packetType);
    expect(["credit_bureau", "collection_agency"]).toContain(built.packet.recipient.type);
    expect(built.packet.packetType).not.toMatch(/furnisher/i);
    expect(built.packet.metadata.selectedIssueIds).toEqual([fixture.readyIssueId]);
    expect(built.packet.evidenceLocations?.[String(fixture.readyIssueId)]).toEqual([
      expect.objectContaining({
        evidenceId: fixture.balanceEvidenceId,
        fieldKey: "tradelines[0].balance",
        pageNumber: 2,
        sourceMethod: "pdf_text",
        extractionMethod: "native_pdf_text",
        boundingBox: {
          x: 100,
          y: 200,
          width: 90,
          height: 12,
          unit: "pt",
          pageNumber: 2,
          coordinateSource: "pdfjs_text_item",
          coordinateValidated: true,
        },
      }),
    ]);
    expect(built.packet.disputedItems).toEqual(
      expect.arrayContaining([expect.objectContaining({ issueId: fixture.readyIssueId })]),
    );

    const createResponse = await createPacket(postRequest("/_api/packet/create", requestBody));
    expect(createResponse.status).toBe(200);
    const createdPacket = await createResponse.json();
    expect(createdPacket.success).toBe(true);
    expect(createdPacket.packetId).toEqual(expect.any(Number));
    track(created.packetIds, createdPacket.packetId);

    const persisted = await db
      .selectFrom("packet")
      .select(["id", "userId", "tradelineId", "creditorObligationTestId", "type", "status", "content"])
      .where("id", "=", createdPacket.packetId)
      .executeTakeFirstOrThrow();
    expect(persisted.userId).toBe(owner.id);
    expect(persisted.creditorObligationTestId).toBe(fixture.readyIssueId);
    expect(persisted.type).toBe("credit_bureau_dispute");
    expect(persisted.status).toBe("generated");

    const persistedContent = JSON.parse(persisted.content ?? "{}");
    expect(persistedContent.metadata.selectedIssueIds).toEqual([fixture.readyIssueId]);
    expect(persistedContent.evidenceLocations?.[String(fixture.readyIssueId)]).toEqual([
      expect.objectContaining({
        evidenceId: fixture.balanceEvidenceId,
        fieldKey: "tradelines[0].balance",
        pageNumber: 2,
        boundingBox: {
          x: 100,
          y: 200,
          width: 90,
          height: 12,
          unit: "pt",
          pageNumber: 2,
          coordinateSource: "pdfjs_text_item",
          coordinateValidated: true,
        },
      }),
    ]);
    expect(persistedContent.disputedItems).toEqual(
      expect.arrayContaining([expect.objectContaining({ issueId: fixture.readyIssueId })]),
    );

    const linkedRows = await db
      .selectFrom("disputePacketFindings")
      .selectAll()
      .where("disputePacketId", "=", createdPacket.packetId)
      .execute();
    expect(linkedRows).toHaveLength(1);
    const linkedRow = linkedRows[0];
    expect(idText(linkedRow.creditorObligationTestId)).toBe(idText(fixture.readyIssueId));
    expect(idText(linkedRow.userId)).toBe(idText(owner.id));
    expect(idText(linkedRow.tradelineId)).toBe(idText(persisted.tradelineId));
    expect(idText(linkedRow.reportArtifactId)).toMatch(/^\d+$/);
    expect(idText(linkedRow.bureauId)).toBe(idText(fixture.bureauId));
    expect(linkedRow.packetType).toBe("credit_bureau");
    expect(linkedRow.statusAtCreation).toBe("generated");
    expect(linkedRow.sourceVersion).toBe("simple-dispute-packet-v1");
    expect(linkedRow.backfilled).toBe(false);
    expect(jsonValue<string[]>(linkedRow.evidenceIds)).toEqual([fixture.balanceEvidenceId]);
    expect(jsonValue<Record<string, unknown>[]>(linkedRow.evidenceLocationSnapshot)).toEqual([
      expect.objectContaining({
        evidenceId: fixture.balanceEvidenceId,
        fieldKey: "tradelines[0].balance",
        pageNumber: 2,
        boundingBox: {
          x: 100,
          y: 200,
          width: 90,
          height: 12,
          unit: "pt",
          pageNumber: 2,
          coordinateSource: "pdfjs_text_item",
          coordinateValidated: true,
        },
      }),
    ]);
    expect(jsonValue<Record<string, unknown>[]>(linkedRow.evidenceLocationSnapshot)[0]).not.toHaveProperty("textSnippet");
    expect(JSON.stringify(jsonValue<Record<string, unknown>[]>(linkedRow.evidenceLocationSnapshot))).not.toContain(
      `ACCT-${marker}-READY`,
    );
    expect(JSON.stringify(jsonValue<Record<string, unknown>[]>(linkedRow.evidenceLocationSnapshot))).not.toMatch(
      /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/,
    );
    expect(jsonValue<Record<string, unknown>>(linkedRow.readinessSnapshot)).toMatchObject({
      packetReady: true,
      findingEligible: true,
      reasonCodes: [],
    });
    const itemSnapshot = jsonValue<Record<string, unknown>>(linkedRow.packetItemSnapshot);
    expect(itemSnapshot).toMatchObject({
      issueId: fixture.readyIssueId,
      tradelineId: persisted.tradelineId,
      maskedAccountNumber: expect.stringMatching(/^Account ending /),
      evidenceReferenceHash: expect.any(String),
    });
    expect(JSON.stringify(itemSnapshot)).not.toContain(`ACCT-${marker}-READY`);
    expect(JSON.stringify(itemSnapshot)).not.toMatch(/\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/);

    await expect(
      db
        .insertInto("disputePacketFindings")
        .values({
          disputePacketId: createdPacket.packetId,
          creditorObligationTestId: fixture.readyIssueId,
          reportArtifactId: linkedRow.reportArtifactId,
          tradelineId: linkedRow.tradelineId,
          userId: linkedRow.userId,
          bureauId: linkedRow.bureauId,
          packetType: "credit_bureau",
          evidenceIds: [] as any,
          evidenceLocationSnapshot: [] as any,
          readinessSnapshot: {} as any,
          packetItemSnapshot: {} as any,
          statusAtCreation: "generated",
          selectedAt: reportDate,
          createdAt: reportDate,
          createdBy: owner.id,
          sourceVersion: "simple-dispute-packet-v1",
          backfilled: false,
        })
        .execute(),
    ).rejects.toThrow();

    const pdfResponse = await getPacketPdf(pdfRequest(createdPacket.packetId));
    expect(pdfResponse.status).toBe(200);
    expect(pdfResponse.headers.get("Content-Type")).toContain("application/pdf");
    expect((await pdfResponse.arrayBuffer()).byteLength).toBeGreaterThan(100);

    auth.user = nonOwner;
    const deniedPdfResponse = await getPacketPdf(pdfRequest(createdPacket.packetId));
    expect(deniedPdfResponse.status).toBe(403);
    expect(await deniedPdfResponse.json()).toEqual({ error: "Unauthorized access to packet" });
  });

  it("creates one additive finding row per ready multi-issue packet item without setting the legacy single-issue link", async () => {
    const marker = syntheticMarker();
    const owner = await createFixtureUser(marker, "owner");
    const fixture = await createPacketSourceFixture(owner, marker);
    const selectedIssueIds = [fixture.readyIssueId, fixture.secondaryReadyIssueId];
    const requestBody = {
      packetType: "credit_bureau",
      selectedIssueIds,
      recipientBureauId: fixture.bureauId,
    };

    auth.user = owner;
    const createResponse = await createPacket(postRequest("/_api/packet/create", requestBody));
    expect(createResponse.status).toBe(200);
    const createdPacket = await createResponse.json();
    track(created.packetIds, createdPacket.packetId);

    const persisted = await db
      .selectFrom("packet")
      .select(["id", "creditorObligationTestId", "content"])
      .where("id", "=", createdPacket.packetId)
      .executeTakeFirstOrThrow();
    expect(persisted.creditorObligationTestId).toBeNull();

    const persistedContent = JSON.parse(persisted.content ?? "{}");
    expect(persistedContent.metadata.selectedIssueIds.sort((left: number, right: number) => left - right)).toEqual(
      selectedIssueIds.slice().sort((left, right) => left - right),
    );
    expect(persistedContent.disputedItems.map((item: { issueId: number }) => item.issueId).sort()).toEqual(
      selectedIssueIds.slice().sort((left, right) => left - right),
    );
    expect(persistedContent.evidenceLocations?.[String(fixture.readyIssueId)]).toHaveLength(1);
    expect(persistedContent.evidenceLocations?.[String(fixture.secondaryReadyIssueId)]).toHaveLength(1);

    const linkedRows = await db
      .selectFrom("disputePacketFindings")
      .selectAll()
      .where("disputePacketId", "=", createdPacket.packetId)
      .orderBy("creditorObligationTestId", "asc")
      .execute();
    expect(linkedRows).toHaveLength(2);
    expect(sortedIdTexts(linkedRows.map((row) => row.creditorObligationTestId))).toEqual(sortedIdTexts(selectedIssueIds));
    expect(linkedRows.every((row) => row.packetType === "credit_bureau")).toBe(true);
    expect(linkedRows.every((row) => row.backfilled === false)).toBe(true);
    expect(linkedRows.map((row) => jsonValue<string[]>(row.evidenceIds)[0]).sort()).toEqual(
      [fixture.balanceEvidenceId, fixture.statusEvidenceId].sort(),
    );

    for (const row of linkedRows) {
      const locations = jsonValue<Record<string, unknown>[]>(row.evidenceLocationSnapshot);
      expect(locations).toHaveLength(1);
      expect(locations[0]).toMatchObject({
        pageNumber: 2,
        boundingBox: expect.objectContaining({
          unit: "pt",
          pageNumber: 2,
          coordinateSource: "pdfjs_text_item",
          coordinateValidated: true,
        }),
      });
      expect(locations[0]).not.toHaveProperty("textSnippet");
      const itemSnapshot = jsonValue<Record<string, unknown>>(row.packetItemSnapshot);
      expect(idText(itemSnapshot.issueId)).toBe(idText(row.creditorObligationTestId));
      expect(itemSnapshot).toMatchObject({
        maskedAccountNumber: expect.stringMatching(/^Account ending /),
      });
    }
  });

  it("keeps old packets without finding rows readable through list, get, and PDF endpoints", async () => {
    const marker = syntheticMarker();
    const owner = await createFixtureUser(marker, "owner");
    const fixture = await createPacketSourceFixture(owner, marker);

    const source = await db
      .selectFrom("creditorObligationTest as issue")
      .innerJoin("tradeline as tradeline", "tradeline.id", "issue.tradelineId")
      .select(["tradeline.id as tradelineId", "tradeline.accountNumber"])
      .where("issue.id", "=", fixture.readyIssueId)
      .executeTakeFirstOrThrow();
    const legacyContent = buildSimpleDisputePacketContent({
      packetType: "credit_bureau",
      reportType: "Synthetic legacy credit report",
      reportDate,
      recipient: {
        type: "credit_bureau",
        name: "Synthetic Bureau",
        address: ["200 Bureau Test Street", "Toronto, ON M5J 2N8"],
      },
      consumer: {
        name: owner.displayName,
        address: ["100 Synthetic Test Avenue", "Halifax, NS B3J 0A1"],
      },
      disputedItems: [
        {
          issueId: fixture.readyIssueId,
          tradelineId: source.tradelineId,
          creditorCollectorName: "Synthetic Creditor",
          accountNumber: source.accountNumber,
          disputedField: "Balance",
          reportedValue: "$200",
          expectedValue: "$100",
          issueType: "BALANCE_CALCULATION_VIOLATION",
          evidenceReference: "Source report #1; field: balance; page 2",
          requestedAction: "correct balance",
        },
      ],
      reportArtifactIds: [],
      generatedByUserId: owner.id,
    });

    const legacyPacket = await db
      .insertInto("packet")
      .values({
        userId: owner.id,
        tradelineId: source.tradelineId,
        bureauId: fixture.bureauId,
        creditorObligationTestId: fixture.readyIssueId,
        type: "credit_bureau_dispute",
        status: "generated",
        processingStatus: "completed",
        content: JSON.stringify(legacyContent),
        terminalLabel: null,
        letterDate: reportDate,
        recipientName: "Synthetic Bureau",
        recipientAddressLine1: "200 Bureau Test Street",
        recipientAddressLine2: null,
        recipientCity: "Toronto",
        recipientProvince: "ON",
        recipientPostalCode: "M5J 2N8",
        region: "CA",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    track(created.packetIds, legacyPacket.id);

    expect(
      await db
        .selectFrom("disputePacketFindings")
        .select("id")
        .where("disputePacketId", "=", legacyPacket.id)
        .execute(),
    ).toHaveLength(0);

    auth.user = owner;
    const listResponse = await listPackets(getRequest("/_api/packet/list"));
    expect(listResponse.status).toBe(200);
    const listed = await listResponse.json();
    expect(listed.packets.some((packet: { id: number }) => packet.id === legacyPacket.id)).toBe(true);

    const getResponse = await getPacket(getRequest(`/_api/packet/get?packetId=${legacyPacket.id}`));
    expect(getResponse.status).toBe(200);
    const details = await getResponse.json();
    expect(details.packet.id).toBe(legacyPacket.id);

    await ensureConsumerIdentificationSchema();
    await db
      .insertInto("consumerIdentificationDocument")
      .values({
        userId: owner.id,
        fileName: "missing-id.jpeg",
        fileType: "image/jpeg",
        fileSizeBytes: 123,
        storageUrl: `local:identification/${owner.id}/missing-id.jpeg`,
        sha256: "missing-identification-file",
        uploadedAt: reportDate,
        updatedAt: reportDate,
        region: "CA",
      })
      .execute();

    const pdfResponse = await getPacketPdf(pdfRequest(legacyPacket.id));
    expect(pdfResponse.status).toBe(200);
    expect(pdfResponse.headers.get("Content-Type")).toContain("application/pdf");
    expect((await pdfResponse.arrayBuffer()).byteLength).toBeGreaterThan(100);
  });

  it("lets admins download a formal packet when a saved consumer ID attachment is missing from storage", async () => {
    const marker = syntheticMarker();
    const owner = await createFixtureUser(marker, "owner");
    const admin = await createFixtureUser(marker, "admin", "admin");
    const fixture = await createPacketSourceFixture(owner, marker);

    const source = await db
      .selectFrom("creditorObligationTest as issue")
      .innerJoin("tradeline as tradeline", "tradeline.id", "issue.tradelineId")
      .select("tradeline.id as tradelineId")
      .where("issue.id", "=", fixture.readyIssueId)
      .executeTakeFirstOrThrow();

    const formalPacketContent = {
      consumerName: owner.displayName,
      consumerAddress: ["100 Synthetic Test Avenue", "Halifax, NS B3J 0A1"],
      letterDate: "2026-05-11",
      recipientName: "Synthetic Bureau",
      recipientAddress: ["200 Bureau Test Street", "Toronto, ON M5J 2N8"],
      subject: "Synthetic packet review request",
      introduction: "Please review the disputed item listed below.",
      disputedItems: "Balance reports $200 while the expected balance is $100.",
      statutoryGrounds: "This item may require review under applicable credit reporting obligations.",
      supportingDocumentation: "Source report evidence is referenced in the packet record.",
      requestedAction: "Please investigate and correct the balance if verified.",
      certification: "I certify this request is accurate to the best of my knowledge.",
      closing: "Sincerely,",
    };

    const packet = await db
      .insertInto("packet")
      .values({
        userId: owner.id,
        tradelineId: source.tradelineId,
        bureauId: fixture.bureauId,
        creditorObligationTestId: fixture.readyIssueId,
        type: "credit_bureau_dispute",
        status: "generated",
        processingStatus: "completed",
        content: JSON.stringify(formalPacketContent),
        terminalLabel: null,
        letterDate: reportDate,
        recipientName: "Synthetic Bureau",
        recipientAddressLine1: "200 Bureau Test Street",
        recipientAddressLine2: null,
        recipientCity: "Toronto",
        recipientProvince: "ON",
        recipientPostalCode: "M5J 2N8",
        region: "CA",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    track(created.packetIds, packet.id);

    await ensureConsumerIdentificationSchema();
    await db
      .insertInto("consumerIdentificationDocument")
      .values({
        userId: owner.id,
        fileName: "missing-id.jpeg",
        fileType: "image/jpeg",
        fileSizeBytes: 123,
        storageUrl: `local:identification/${owner.id}/missing-admin-download-id.jpeg`,
        sha256: "missing-identification-file-admin-download",
        uploadedAt: reportDate,
        updatedAt: reportDate,
        region: "CA",
      })
      .execute();

    auth.user = owner;
    const ownerPdfResponse = await getPacketPdf(pdfRequest(packet.id));
    expect(ownerPdfResponse.status).toBe(400);
    expect(await ownerPdfResponse.json()).toEqual({
      error: "Please upload your identification in profile settings before downloading this packet.",
    });

    auth.user = admin;
    const adminPdfResponse = await getPacketPdf(pdfRequest(packet.id));
    expect(adminPdfResponse.status).toBe(200);
    expect(adminPdfResponse.headers.get("Content-Type")).toContain("application/pdf");
    expect((await adminPdfResponse.arrayBuffer()).byteLength).toBeGreaterThan(100);
  });

  it("rejects missing-evidence findings and does not persist a packet", async () => {
    const marker = syntheticMarker();
    const owner = await createFixtureUser(marker, "owner");
    const fixture = await createPacketSourceFixture(owner, marker);
    const requestBody = {
      packetType: "credit_bureau",
      selectedIssueIds: [fixture.blockedIssueId],
      recipientBureauId: fixture.bureauId,
    };

    auth.user = owner;
    const readinessResponse = await validateReadiness(postRequest("/_api/packet/validate-readiness", requestBody));
    expect(readinessResponse.status).toBe(200);
    const readiness = await readinessResponse.json();
    expect(readiness.packetReady).toBe(false);
    expect(readiness.ineligibleFindingIds).toContain(fixture.blockedIssueId);
    expect(readiness.reasonCodes).toEqual(
      expect.arrayContaining(["MISSING_REQUIRED_EVIDENCE", "MANUAL_REVIEW_REQUIRED"]),
    );

    const buildResponse = await buildPacket(postRequest("/_api/packet/build", requestBody));
    expect(buildResponse.status).toBe(400);
    expect(await buildResponse.json()).toEqual({
      error: "Required source-report evidence is missing for this finding.",
    });

    const createResponse = await createPacket(postRequest("/_api/packet/create", requestBody));
    expect(createResponse.status).toBe(400);
    expect(await createResponse.json()).toEqual({
      error: "Required source-report evidence is missing for this finding.",
    });

    const persisted = await db
      .selectFrom("packet")
      .select("id")
      .where("creditorObligationTestId", "=", fixture.blockedIssueId)
      .execute();
    expect(persisted).toHaveLength(0);
  });

  it("rejects dismissed findings through endpoint readiness and create paths", async () => {
    const marker = syntheticMarker();
    const owner = await createFixtureUser(marker, "owner");
    const fixture = await createPacketSourceFixture(owner, marker);
    const requestBody = {
      packetType: "credit_bureau",
      selectedIssueIds: [fixture.dismissedIssueId],
      recipientBureauId: fixture.bureauId,
    };

    auth.user = owner;
    const readinessResponse = await validateReadiness(postRequest("/_api/packet/validate-readiness", requestBody));
    expect(readinessResponse.status).toBe(200);
    const readiness = await readinessResponse.json();
    expect(readiness.packetReady).toBe(false);
    expect(readiness.reasonCodes).toContain("DISMISSED_FINDING");

    const buildResponse = await buildPacket(postRequest("/_api/packet/build", requestBody));
    expect(buildResponse.status).toBe(400);
    expect(await buildResponse.json()).toEqual({
      error: "Dismissed findings cannot be used to create packets.",
    });

    const createResponse = await createPacket(postRequest("/_api/packet/create", requestBody));
    expect(createResponse.status).toBe(400);
    expect(await createResponse.json()).toEqual({
      error: "Dismissed findings cannot be used to create packets.",
    });

    const persisted = await db
      .selectFrom("packet")
      .select("id")
      .where("creditorObligationTestId", "=", fixture.dismissedIssueId)
      .execute();
    expect(persisted).toHaveLength(0);
  });
});
