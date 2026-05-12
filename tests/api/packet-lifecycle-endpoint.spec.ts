import "../../loadEnv.js";

import type { Kysely } from "kysely";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { DB } from "../../helpers/schema";
import type { User } from "../../helpers/User";
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
    await db.deleteFrom("packetComplianceAudit").where("packetId", "in", packetIds).execute();
    await db.deleteFrom("evidenceEvent").where("packetId", "in", packetIds).execute();
    await db.deleteFrom("auditLog").where("entityType", "=", "PACKET").where("entityId", "in", packetIds).execute();
    await db.deleteFrom("packet").where("id", "in", packetIds).execute();
  }

  if (issueIds.length > 0) {
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

async function createFixtureUser(marker: string, label: string): Promise<AuthUser> {
  const row = await db
    .insertInto("users")
    .values({
      email: `${marker}-${label}@example.test`,
      displayName: `Packet Lifecycle ${label}`,
      avatarUrl: null,
      organizationId: null,
      role: "user",
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
      role: "user",
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
  const balanceEvidenceSnippet =
    "Synthetic source report line: balance field reports 200 while expected balance is 100.";
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
    blockedIssueId: blockedIssue,
    dismissedIssueId: dismissedIssue,
    balanceEvidenceId,
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
    validateReadiness = (await import("../../endpoints/packet/validate-readiness_POST")).handle;
    buildPacket = (await import("../../endpoints/packet/build_POST")).handle;
    createPacket = (await import("../../endpoints/packet/create_POST")).handle;
    getPacketPdf = (await import("../../endpoints/packet/pdf_GET")).handle;
  });

  afterEach(async () => {
    auth.user = null;
    await cleanupCreatedRows();
  });

  afterAll(async () => {
    await db?.destroy();
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
      }),
    ]);
    expect(persistedContent.disputedItems).toEqual(
      expect.arrayContaining([expect.objectContaining({ issueId: fixture.readyIssueId })]),
    );

    const pdfResponse = await getPacketPdf(pdfRequest(createdPacket.packetId));
    expect(pdfResponse.status).toBe(200);
    expect(pdfResponse.headers.get("Content-Type")).toContain("application/pdf");
    expect((await pdfResponse.arrayBuffer()).byteLength).toBeGreaterThan(100);

    auth.user = nonOwner;
    const deniedPdfResponse = await getPacketPdf(pdfRequest(createdPacket.packetId));
    expect(deniedPdfResponse.status).toBe(403);
    expect(await deniedPdfResponse.json()).toEqual({ error: "Unauthorized access to packet" });
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
