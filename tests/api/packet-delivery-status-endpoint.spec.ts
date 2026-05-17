import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotAuthenticatedError } from "../../helpers/getSetServerSession";

type QueryResult = {
  execute?: unknown[];
  first?: unknown;
  firstOrThrow?: unknown;
};

type DbOperation = {
  kind: "select" | "insert" | "update" | "delete";
  table: string;
  method: "where" | "limit" | "offset" | "orderBy" | "values" | "set";
  args: unknown[];
};

const mocks = vi.hoisted(() => ({
  queryQueue: [] as QueryResult[],
  operations: [] as DbOperation[],
  db: {
    selectFrom: vi.fn(),
    insertInto: vi.fn(),
    updateTable: vi.fn(),
    deleteFrom: vi.fn(),
    transaction: vi.fn(),
  },
  getServerUserSession: vi.fn(),
  validateOrigin: vi.fn(),
  checkRateLimit: vi.fn(),
  getPostalPricingFromDB: vi.fn(),
  evaluateSubscriptionAccess: vi.fn(),
  subscriptionAccessErrorResponse: vi.fn(),
  hasConsumerIdentification: vi.fn(),
  getConsumerIdentificationPdfAttachment: vi.fn(),
  attachConsumerIdentificationToLetterContent: vi.fn(),
  sendRegisteredMail: vi.fn(),
  verifyPaymentIntent: vi.fn(),
  refundPaymentIntent: vi.fn(),
  calculateDeadline: vi.fn(),
  createDeadlineEvent: vi.fn(),
  resolvePdfStorageUrl: vi.fn(),
  readStoredPdf: vi.fn(),
  parseStoredPacketContent: vi.fn(),
  applySignatureToPacketContent: vi.fn(),
  applyRecipientOverrideToPacketContent: vi.fn(),
  attachIdentificationToPacketContent: vi.fn(),
  generatePacketContentPdfBase64: vi.fn(),
}));

vi.mock("../../helpers/db", () => ({
  db: mocks.db,
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: mocks.getServerUserSession,
}));

vi.mock("../../helpers/domainGuard", () => ({
  validateOrigin: mocks.validateOrigin,
}));

vi.mock("../../helpers/rateLimiter", () => ({
  checkRateLimit: mocks.checkRateLimit,
  RateLimitConfig: {
    SEND_REGISTERED: { maxAttempts: 3, windowMinutes: 60 },
    SEND_FIRST_CLASS: { maxAttempts: 3, windowMinutes: 60 },
  },
}));

vi.mock("../../helpers/getPostalPricingFromDB", () => ({
  getPostalPricingFromDB: mocks.getPostalPricingFromDB,
}));

vi.mock("../../helpers/subscriptionAccess", () => ({
  evaluateSubscriptionAccess: mocks.evaluateSubscriptionAccess,
  subscriptionAccessErrorResponse: mocks.subscriptionAccessErrorResponse,
}));

vi.mock("../../helpers/consumerIdentification", () => ({
  hasConsumerIdentification: mocks.hasConsumerIdentification,
  getConsumerIdentificationPdfAttachment: mocks.getConsumerIdentificationPdfAttachment,
  attachConsumerIdentificationToLetterContent: mocks.attachConsumerIdentificationToLetterContent,
}));

vi.mock("../../helpers/postgridClient", () => ({
  sendRegisteredMail: mocks.sendRegisteredMail,
  getLetterStatus: vi.fn(),
  isPostGridTestMode: vi.fn(() => true),
}));

vi.mock("../../helpers/stripeServer", () => ({
  verifyPaymentIntent: mocks.verifyPaymentIntent,
  refundPaymentIntent: mocks.refundPaymentIntent,
}));

vi.mock("../../helpers/deadlineCalculator", () => ({
  calculateDeadline: mocks.calculateDeadline,
  createDeadlineEvent: mocks.createDeadlineEvent,
}));

vi.mock("../../helpers/documentStorage", () => ({
  resolvePdfStorageUrl: mocks.resolvePdfStorageUrl,
  readStoredPdf: mocks.readStoredPdf,
}));

vi.mock("../../helpers/packetPdfContent", () => ({
  parseStoredPacketContent: mocks.parseStoredPacketContent,
  applySignatureToPacketContent: mocks.applySignatureToPacketContent,
  applyRecipientOverrideToPacketContent: mocks.applyRecipientOverrideToPacketContent,
  attachIdentificationToPacketContent: mocks.attachIdentificationToPacketContent,
  generatePacketContentPdfBase64: mocks.generatePacketContentPdfBase64,
}));

import { handle as recordDelivery } from "../../endpoints/packet/delivery_POST";
import { handle as getPacket } from "../../endpoints/packet/get_GET";
import { handle as listPackets } from "../../endpoints/packet/list_GET";
import { handle as sendFirstClass } from "../../endpoints/packet/send-first-class_POST";
import { handle as sendRegistered } from "../../endpoints/packet/send-registered_POST";
import { handle as updatePacketStatus } from "../../endpoints/packet/update-status_POST";

function makeBuilder(table: string, kind: DbOperation["kind"], result: QueryResult = {}) {
  const builder: Record<string, any> = {};
  const chain = (method: DbOperation["method"]) =>
    vi.fn((...args: unknown[]) => {
      mocks.operations.push({ kind, table, method, args });
      return builder;
    });

  for (const method of ["where", "limit", "offset", "orderBy"] as const) {
    builder[method] = chain(method);
  }
  builder.values = chain("values");
  builder.set = chain("set");
  builder.select = vi.fn(() => builder);
  builder.selectAll = vi.fn(() => builder);
  builder.leftJoin = vi.fn(() => builder);
  builder.innerJoin = vi.fn(() => builder);
  builder.returning = vi.fn(() => builder);
  builder.returningAll = vi.fn(() => builder);
  builder.execute = vi.fn(async () => result.execute ?? []);
  builder.executeTakeFirst = vi.fn(async () => result.first ?? null);
  builder.executeTakeFirstOrThrow = vi.fn(async () => result.firstOrThrow ?? result.first ?? {});
  return builder;
}

function installDbHarness() {
  mocks.db.selectFrom.mockImplementation((table: string) =>
    makeBuilder(table, "select", mocks.queryQueue.shift()),
  );
  mocks.db.insertInto.mockImplementation((table: string) =>
    makeBuilder(table, "insert", mocks.queryQueue.shift()),
  );
  mocks.db.updateTable.mockImplementation((table: string) =>
    makeBuilder(table, "update", mocks.queryQueue.shift()),
  );
  mocks.db.deleteFrom.mockImplementation((table: string) =>
    makeBuilder(table, "delete", mocks.queryQueue.shift()),
  );
  mocks.db.transaction.mockReturnValue({
    execute: vi.fn(async (callback: (trx: typeof mocks.db) => unknown) => callback(mocks.db)),
  });
}

function queueResults(...results: QueryResult[]) {
  mocks.queryQueue.push(...results);
}

function postRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://staging.creditregulatorpro.com",
      "user-agent": "synthetic-packet-delivery-test",
      "x-client-user-id": "999999",
      "x-client-role": "admin",
    },
    body: JSON.stringify(body),
  });
}

function getRequest(path: string) {
  return new Request(`http://localhost${path}`, {
    method: "GET",
    headers: {
      origin: "https://staging.creditregulatorpro.com",
      "user-agent": "synthetic-packet-delivery-test",
    },
  });
}

function currentUser(role = "user") {
  return {
    id: role === "admin" ? 1 : role === "support" ? 20 : 10,
    role,
    organizationId: 1000,
    displayName: `Synthetic ${role}`,
    email: `synthetic.${role}@example.invalid`,
    subscriptionPlan: "monthly",
    subscriptionStatus: "active",
    trialEnd: null,
  };
}

function packetContent() {
  return {
    version: "simple-dispute-packet-v1",
    packetType: "credit_bureau",
    title: "Synthetic Credit Bureau Dispute Packet",
    reportType: "Synthetic",
    reportDate: "2026-01-01",
    dateGenerated: "2026-01-02",
    recipient: {
      type: "credit_bureau",
      name: "Synthetic Credit Bureau",
      address: ["100 Synthetic Bureau Road", "Toronto, ON M5A 0A1"],
    },
    consumer: {
      name: "Synthetic Consumer",
      address: ["200 Synthetic Home Road", "Halifax, NS B3J 0A1"],
      phone: null,
      email: "synthetic.consumer@example.invalid",
    },
    openingParagraph: "Synthetic packet body.",
    disputedItems: [],
    requestedActionSummary: "Synthetic requested action.",
    evidenceList: ["Synthetic compact evidence reference."],
    attachmentChecklist: [],
    signatureLine: "Signature",
    metadata: {
      selectedIssueIds: [301],
      reportArtifactIds: [401],
      generatedByUserId: 10,
    },
  };
}

function packetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 601,
    userId: 10,
    tradelineUserId: 10,
    tradelineId: 701,
    creditorObligationTestId: 301,
    status: "generated",
    content: JSON.stringify(packetContent()),
    bureauId: 801,
    recipientName: "Synthetic Credit Bureau",
    recipientAddressLine1: "100 Synthetic Bureau Road",
    recipientAddressLine2: null,
    recipientCity: "Toronto",
    recipientProvince: "ON",
    recipientPostalCode: "M5A 0A1",
    bureauName: "Synthetic Credit Bureau",
    bureauAddressLine1: "100 Synthetic Bureau Road",
    bureauAddressLine2: null,
    bureauCity: "Toronto",
    bureauProvince: "ON",
    bureauPostalCode: "M5A 0A1",
    ...overrides,
  };
}

function listPacketRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 601,
    tradelineId: 701,
    status: "sent",
    terminalLabel: "Synthetic packet",
    content: JSON.stringify(packetContent()),
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    type: "credit_bureau",
    signatureMode: "consumer",
    region: "CA",
    statuteVersionId: null,
    bureauResponseDate: null,
    responseType: null,
    successOutcome: null,
    deliveryMethod: "Canada Post Registered Mail",
    trackingNumber: "SYNTHETIC_TRACKING_001",
    sentDate: new Date("2026-01-03T00:00:00.000Z"),
    consumerCertification: true,
    letterDate: new Date("2026-01-03T00:00:00.000Z"),
    organizationId: 1000,
    bureauId: 801,
    creditorObligationTestId: 301,
    postgridLetterId: "pg_synthetic_letter_001",
    processingStatus: "completed",
    recipientName: "Synthetic Credit Bureau",
    recipientAddressLine1: "100 Synthetic Bureau Road",
    recipientAddressLine2: null,
    recipientCity: "Toronto",
    recipientProvince: "ON",
    recipientPostalCode: "M5A 0A1",
    tradelineAccountNumber: "1234567890123456",
    tradelineOriginalCreditorName: "Synthetic Creditor",
    tradelineCreditorNameFromTable: null,
    bureauName: "Synthetic Credit Bureau",
    responseClockDays: 30,
    ...overrides,
  };
}

function detailPacketRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 601,
    status: "sent",
    terminalLabel: "Synthetic packet",
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    pdfStorageUrl:
      "local:packet/10/SYNTHETIC_PRIVATE_PACKET_PATH_SHOULD_NOT_APPEAR?X-Goog-Signature=secret",
    sentDate: new Date("2026-01-03T00:00:00.000Z"),
    bureauResponseDate: null,
    responseType: null,
    successOutcome: null,
    processingStatus: "completed",
    deliveryMethod: "Canada Post Registered Mail",
    trackingNumber: "SYNTHETIC_TRACKING_001",
    letterDate: new Date("2026-01-03T00:00:00.000Z"),
    consumerCertification: true,
    recipientName: "Synthetic Credit Bureau",
    userId: 10,
    tradelineAccountNumber: "1234567890123456",
    bureauName: "Synthetic Credit Bureau",
    responseClockDays: 30,
    ...overrides,
  };
}

function deliveryBody(overrides: Record<string, unknown> = {}) {
  return {
    packetId: 601,
    deliveryMethod: "Synthetic Registered Mail",
    trackingNumber: "SYNTHETIC_TRACKING_001",
    sentDate: "2026-01-03T00:00:00.000Z",
    consumerCertification: true,
    letterDate: "2026-01-03T00:00:00.000Z",
    userReviewed: true,
    userApproved: true,
    ...overrides,
  };
}

function sendBody(overrides: Record<string, unknown> = {}) {
  return {
    packetId: 601,
    paymentIntentId: "pi_synthetic_packet_delivery_001",
    userReviewed: true,
    userApproved: true,
    ...overrides,
  };
}

function valuesFor(table: string) {
  return mocks.operations
    .filter((operation) => operation.kind === "insert" && operation.table === table && operation.method === "values")
    .map((operation) => operation.args[0]);
}

function setFor(table: string) {
  return mocks.operations
    .filter((operation) => operation.kind === "update" && operation.table === table && operation.method === "set")
    .map((operation) => operation.args[0]);
}

function whereValues(column: string) {
  return mocks.operations
    .filter((operation) => operation.method === "where" && operation.args[0] === column)
    .map((operation) => operation.args);
}

function expectNoSensitiveLeak(value: unknown) {
  const text = JSON.stringify(value);
  expect(text).not.toContain("SYNTHETIC_FULL_SIN_SHOULD_NOT_APPEAR");
  expect(text).not.toContain("SYNTHETIC_RAW_REPORT_TEXT_SHOULD_NOT_APPEAR");
  expect(text).not.toContain("SYNTHETIC_RAW_PACKET_BODY_SHOULD_NOT_APPEAR");
  expect(text).not.toContain("SYNTHETIC_PRIVATE_PACKET_PATH_SHOULD_NOT_APPEAR");
  expect(text).not.toContain("SYNTHETIC_PROVIDER_SECRET_SHOULD_NOT_APPEAR");
  expect(text).not.toMatch(/\b123[-\s]?456[-\s]?789\b/);
  expect(text).not.toMatch(/\b1234567890123456\b/);
  expect(text).not.toMatch(/X-Goog-|AWSAccessKeyId|Signature=/i);
  expect(text).not.toMatch(/sk_live|postgrid_live|webhook_secret/i);
}

function queueSendHappyPath(status = "generated") {
  queueResults(
    { first: { termsAcceptedAt: new Date("2026-01-01T00:00:00.000Z") } },
    { first: packetRow({ status }) },
    { first: { plan: "monthly", status: "active", trialEnd: null } },
    { first: { signatureData: "data:image/png;base64,U1lOVEhFVElDX1NJR05BVFVSRQ==" } },
    {
      first: {
        addressLine1: "200 Synthetic Home Road",
        addressLine2: null,
        city: "Halifax",
        province: "NS",
        postalCode: "B3J 0A1",
        fullName: "Synthetic Consumer",
      },
    },
    { first: { currentHash: "a".repeat(64) } },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queryQueue.length = 0;
  mocks.operations.length = 0;
  installDbHarness();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  mocks.getServerUserSession.mockResolvedValue({ user: currentUser("user") });
  mocks.validateOrigin.mockResolvedValue({ valid: true, mode: "enforce" });
  mocks.checkRateLimit.mockResolvedValue({ allowed: true });
  mocks.getPostalPricingFromDB.mockResolvedValue({
    baseCost: 10,
    surchargeRate: 0.15,
    registeredCost: 13.23,
    firstClassBaseCost: 2.5,
    firstClassCost: 3,
  });
  mocks.evaluateSubscriptionAccess.mockReturnValue({
    blocked: false,
    reason: "active_paid",
    title: "",
    message: "",
    isTrialExpired: false,
  });
  mocks.subscriptionAccessErrorResponse.mockImplementation((result: { message: string }) =>
    new Response(JSON.stringify({ error: result.message }), { status: 402 }),
  );
  mocks.hasConsumerIdentification.mockResolvedValue(true);
  mocks.getConsumerIdentificationPdfAttachment.mockResolvedValue({
    fileName: "synthetic-id.png",
    dataUrl: "data:image/png;base64,U1lOVEhFVElDX0lE",
  });
  mocks.verifyPaymentIntent.mockResolvedValue(undefined);
  mocks.refundPaymentIntent.mockResolvedValue(undefined);
  mocks.calculateDeadline.mockReturnValue({ deadline: new Date("2026-02-02T00:00:00.000Z") });
  mocks.createDeadlineEvent.mockResolvedValue({ id: 8801 });
  mocks.resolvePdfStorageUrl.mockResolvedValue("/_api/packet/pdf?packetId=601");
  mocks.readStoredPdf.mockResolvedValue(Buffer.from("SYNTHETIC_PDF_BYTES"));
  mocks.parseStoredPacketContent.mockReturnValue(packetContent());
  mocks.generatePacketContentPdfBase64.mockResolvedValue(Buffer.from("SYNTHETIC_PDF_BYTES").toString("base64"));
  mocks.sendRegisteredMail.mockResolvedValue({
    id: "pg_synthetic_letter_001",
    trackingNumber: "SYNTHETIC_TRACKING_001",
    expectedDeliveryDate: "2026-01-08",
    testMode: true,
  });
});

describe("packet delivery, status, and send endpoint coverage", () => {
  it("updates owned packet status, allows admin cross-owner status updates, and rejects unauthenticated/non-owner/invalid requests", async () => {
    mocks.getServerUserSession.mockRejectedValueOnce(new NotAuthenticatedError());
    const unauthenticated = await updatePacketStatus(postRequest("/_api/packet/update-status", {
      packetId: 601,
      status: "downloaded",
    }));

    expect(unauthenticated.status).toBe(401);
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();

    queueResults({ first: { id: 601, userId: 10, tradelineUserId: null } });
    const ownerResponse = await updatePacketStatus(postRequest("/_api/packet/update-status", {
      packetId: 601,
      status: "downloaded",
      recipientName: "Synthetic Credit Bureau",
      recipientAddressLine1: "100 Synthetic Bureau Road",
      recipientCity: "Toronto",
      recipientProvince: "ON",
      recipientPostalCode: "M5A 0A1",
      userId: 999999,
      role: "admin",
    }));

    expect(ownerResponse.status).toBe(200);
    await expect(ownerResponse.json()).resolves.toMatchObject({
      success: true,
      packetId: 601,
      status: "downloaded",
      recipientName: "Synthetic Credit Bureau",
    });
    expect(setFor("packet")[0]).toMatchObject({
      status: "downloaded",
      recipientName: "Synthetic Credit Bureau",
    });
    expect(setFor("packet")[0]).not.toHaveProperty("content");
    expect(valuesFor("auditLog")).toEqual([]);
    expect(valuesFor("evidenceEvent")).toEqual([]);

    queueResults({ first: { id: 602, userId: 99, tradelineUserId: null } });
    const nonOwner = await updatePacketStatus(postRequest("/_api/packet/update-status", {
      packetId: 602,
      status: "downloaded",
    }));

    expect(nonOwner.status).toBe(403);
    expect(setFor("packet")).toHaveLength(1);

    mocks.getServerUserSession.mockResolvedValueOnce({ user: currentUser("admin") });
    queueResults({ first: { id: 603, userId: 99, tradelineUserId: null } });
    const adminResponse = await updatePacketStatus(postRequest("/_api/packet/update-status", {
      packetId: 603,
      status: "reviewed_by_admin",
    }));

    expect(adminResponse.status).toBe(200);
    await expect(adminResponse.json()).resolves.toMatchObject({ success: true, packetId: 603 });
    expect(setFor("packet")[1]).toMatchObject({ status: "reviewed_by_admin" });

    const invalid = await updatePacketStatus(postRequest("/_api/packet/update-status", {
      packetId: 601,
      status: "",
    }));

    expect(invalid.status).toBe(400);
    expectNoSensitiveLeak(await invalid.json());
  });

  it("records local delivery for owned packets with evidence, audit, and deadline state while preserving packet content", async () => {
    queueResults(
      { first: { termsAcceptedAt: new Date("2026-01-01T00:00:00.000Z") } },
      { first: { id: 601, tradelineId: 701, userId: 10, status: "generated" } },
      {},
      { first: { currentHash: "a".repeat(64) } },
    );

    const response = await recordDelivery(postRequest("/_api/packet/delivery", deliveryBody()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      packetId: 601,
      message: "Packet delivery information recorded successfully",
      deadlineEventId: 8801,
    });
    expect(mocks.hasConsumerIdentification).toHaveBeenCalledWith(10);
    expect(setFor("packet")[0]).toMatchObject({
      deliveryMethod: "Synthetic Registered Mail",
      trackingNumber: "SYNTHETIC_TRACKING_001",
      consumerCertification: true,
      status: "sent",
    });
    expect(setFor("packet")[0]).not.toHaveProperty("content");
    expect(valuesFor("evidenceEvent")[0]).toMatchObject({
      packetId: 601,
      eventType: "PACKET_SENT",
      previousHash: "a".repeat(64),
      region: "CA",
    });
    expect(valuesFor("auditLog")[0]).toMatchObject({
      actionType: "UPDATE",
      entityType: "PACKET",
      entityId: 601,
      userId: 10,
      status: "SUCCESS",
    });
    expect(valuesFor("auditLog")[0]).toMatchObject({
      details: {
        field: "delivery_info",
        method: "Synthetic Registered Mail",
        tracking: "SYNTHETIC_TRACKING_001",
      },
    });
    expect(mocks.createDeadlineEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        packetId: 601,
        eventType: "BUREAU_RESPONSE_DEADLINE",
        region: "CA",
      }),
    );
    expectNoSensitiveLeak({ packet: setFor("packet"), evidence: valuesFor("evidenceEvent"), audit: valuesFor("auditLog") });
  });

  it("denies non-owner or invalid delivery recording before packet delivery state is written", async () => {
    queueResults(
      { first: { termsAcceptedAt: new Date("2026-01-01T00:00:00.000Z") } },
      { first: { id: 601, tradelineId: 701, userId: 99, status: "generated" } },
    );

    const denied = await recordDelivery(postRequest("/_api/packet/delivery", deliveryBody()));

    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toEqual({ error: "Unauthorized access to packet" });
    expect(setFor("packet")).toEqual([]);
    expect(valuesFor("evidenceEvent")).toEqual([]);
    expect(valuesFor("auditLog")).toEqual([]);

    const invalid = await recordDelivery(postRequest("/_api/packet/delivery", deliveryBody({ deliveryMethod: "" })));

    expect(invalid.status).toBe(400);
    expectNoSensitiveLeak(await invalid.json());
    expect(mocks.sendRegisteredMail).not.toHaveBeenCalled();
  });

  it("sends registered mail through a mocked provider only after ownership, consent, ID, payment, signature, and address checks", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected live provider call"));
    queueSendHappyPath();

    const response = await sendRegistered(postRequest("/_api/packet/send-registered", sendBody()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      message: "Packet sent via registered mail successfully",
      trackingNumber: "SYNTHETIC_TRACKING_001",
      postgridLetterId: "pg_synthetic_letter_001",
      testMode: true,
      paymentRefunded: false,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.verifyPaymentIntent).toHaveBeenCalledWith("pi_synthetic_packet_delivery_001");
    expect(mocks.sendRegisteredMail).toHaveBeenCalledTimes(1);
    expect(mocks.sendRegisteredMail).toHaveBeenCalledWith(
      expect.objectContaining({
        mailingClass: "ca_post_registered",
        pdf: expect.stringMatching(/^data:application\/pdf;base64,/),
        to: expect.objectContaining({
          name: "Synthetic Credit Bureau",
          countryCode: "CA",
        }),
        from: expect.objectContaining({
          name: "Synthetic Consumer",
          countryCode: "CA",
        }),
      }),
    );
    expect(setFor("packet")[0]).toMatchObject({
      deliveryMethod: "Canada Post Registered Mail",
      trackingNumber: "SYNTHETIC_TRACKING_001",
      postgridLetterId: "pg_synthetic_letter_001",
      status: "sent",
    });
    expect(setFor("packet")[0]).not.toHaveProperty("content");
    expect(valuesFor("evidenceEvent")[0]).toMatchObject({
      packetId: 601,
      eventType: "PACKET_SENT",
      region: "CA",
    });
    expect(valuesFor("postalTransaction")[0]).toMatchObject({
      userId: 10,
      packetId: 601,
      postgridLetterId: "pg_synthetic_letter_001",
      stripePaymentIntentId: "pi_synthetic_packet_delivery_001",
      status: "completed",
    });
    expect(valuesFor("auditLog")[0]).toMatchObject({
      actionType: "UPDATE",
      entityType: "PACKET",
      entityId: 601,
      userId: 10,
      details: expect.objectContaining({
        field: "delivery_info",
        method: "Canada Post Registered Mail",
        tracking: "SYNTHETIC_TRACKING_001",
        postgridId: "pg_synthetic_letter_001",
      }),
      status: "SUCCESS",
    });
    expectNoSensitiveLeak({
      providerPayload: mocks.sendRegisteredMail.mock.calls[0][0],
      packetUpdates: setFor("packet"),
      evidence: valuesFor("evidenceEvent"),
      postal: valuesFor("postalTransaction"),
      audit: valuesFor("auditLog"),
    });
    fetchSpy.mockRestore();
  });

  it("keeps send failures controlled, refunds captured payment, and avoids corrupting packet status or creating success audit/evidence rows", async () => {
    queueSendHappyPath();
    mocks.sendRegisteredMail.mockRejectedValueOnce(
      new Error("PostGrid API Error: invalid api key SYNTHETIC_PROVIDER_SECRET_SHOULD_NOT_APPEAR"),
    );

    const response = await sendFirstClass(postRequest("/_api/packet/send-first-class", sendBody()));

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toMatchObject({
      success: false,
      paymentRefunded: true,
      errorDetails: { type: "other" },
    });
    expect(mocks.refundPaymentIntent).toHaveBeenCalledWith("pi_synthetic_packet_delivery_001");
    expect(valuesFor("postalTransaction")[0]).toMatchObject({
      packetId: 601,
      postgridLetterId: null,
      stripePaymentIntentId: "pi_synthetic_packet_delivery_001",
      status: "refunded",
    });
    expect(setFor("packet")).toEqual([]);
    expect(valuesFor("evidenceEvent")).toEqual([]);
    expect(valuesFor("auditLog")).toEqual([]);
    expectNoSensitiveLeak(body);
  });

  it("blocks duplicate send attempts for already-sent packets before provider calls or duplicate delivery records", async () => {
    queueSendHappyPath("sent");

    const response = await sendRegistered(postRequest("/_api/packet/send-registered", sendBody()));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Packet has already been sent or is processing" });
    expect(mocks.sendRegisteredMail).not.toHaveBeenCalled();
    expect(setFor("packet")).toEqual([]);
    expect(valuesFor("evidenceEvent")).toEqual([]);
    expect(valuesFor("auditLog")).toEqual([]);
    expect(valuesFor("postalTransaction")).toEqual([]);
  });

  it("keeps missing identification and non-owner send attempts provider-free and storage-path safe", async () => {
    queueResults(
      { first: { termsAcceptedAt: new Date("2026-01-01T00:00:00.000Z") } },
      { first: packetRow({ userId: 99, tradelineUserId: 99 }) },
    );

    const nonOwner = await sendRegistered(postRequest("/_api/packet/send-registered", sendBody()));

    expect(nonOwner.status).toBe(403);
    await expect(nonOwner.json()).resolves.toEqual({ error: "Unauthorized access to packet" });
    expect(mocks.sendRegisteredMail).not.toHaveBeenCalled();

    queueResults(
      { first: { termsAcceptedAt: new Date("2026-01-01T00:00:00.000Z") } },
      { first: packetRow() },
      { first: { plan: "monthly", status: "active", trialEnd: null } },
    );
    mocks.getConsumerIdentificationPdfAttachment.mockResolvedValueOnce(null);

    const missingId = await sendRegistered(postRequest("/_api/packet/send-registered", sendBody()));

    expect(missingId.status).toBe(400);
    const missingBody = await missingId.json();
    expect(missingBody).toEqual({ error: "Please upload your identification in profile settings before sending." });
    expect(mocks.sendRegisteredMail).not.toHaveBeenCalled();
    expect(setFor("packet")).toEqual([]);
    expect(valuesFor("evidenceEvent")).toEqual([]);
    expectNoSensitiveLeak(missingBody);
  });

  it("reflects safe delivery fields in packet list/get without requiring dispute_packet_findings rows or exposing storage secrets", async () => {
    queueResults({ firstOrThrow: { total: "1" } }, { execute: [listPacketRow()] });

    const listResponse = await listPackets(getRequest("/_api/packet/list?limit=10&offset=0"));

    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody.total).toBe(1);
    expect(listBody.packets[0]).toMatchObject({
      id: 601,
      status: "sent",
      deliveryMethod: "Canada Post Registered Mail",
      trackingNumber: "SYNTHETIC_TRACKING_001",
      tradelineAccountNumber: "Account ending 3456",
      lifecycle: expect.objectContaining({
        stage: expect.any(String),
      }),
    });
    expect(mocks.operations.some((operation) => operation.table === "disputePacketFindings")).toBe(false);
    expectNoSensitiveLeak(listBody);

    queueResults({ first: detailPacketRow() });

    const getResponse = await getPacket(getRequest("/_api/packet/get?packetId=601"));

    expect(getResponse.status).toBe(200);
    const getBody = await getResponse.json();
    expect(getBody.packet).toMatchObject({
      id: 601,
      status: "sent",
      deliveryMethod: "Canada Post Registered Mail",
      trackingNumber: "SYNTHETIC_TRACKING_001",
      tradelineAccountNumber: "Account ending 3456",
      pdfStorageUrl: "/_api/packet/pdf?packetId=601",
      lifecycle: expect.objectContaining({
        stage: expect.any(String),
      }),
    });
    expect(mocks.resolvePdfStorageUrl).toHaveBeenCalledWith(
      "local:packet/10/SYNTHETIC_PRIVATE_PACKET_PATH_SHOULD_NOT_APPEAR?X-Goog-Signature=secret",
    );
    expectNoSensitiveLeak(getBody);

    queueResults({ first: detailPacketRow({ userId: 99 }) });
    const nonOwnerGet = await getPacket(getRequest("/_api/packet/get?packetId=601"));

    expect(nonOwnerGet.status).toBe(403);
    expectNoSensitiveLeak(await nonOwnerGet.json());
  });

  it("keeps packet delivery endpoint sources away from parser, evidence extraction, packet wording/PDF layout, runtime activation, and live provider fetches", () => {
    const deliverySources = [
      "endpoints/packet/update-status_POST.ts",
      "endpoints/packet/delivery_POST.ts",
      "endpoints/packet/send-first-class_POST.ts",
      "endpoints/packet/send-registered_POST.ts",
      "endpoints/packet/list_GET.ts",
      "endpoints/packet/get_GET.ts",
    ]
      .map((path) => readFileSync(resolve(path), "utf8"))
      .join("\n");

    expect(deliverySources).not.toMatch(
      /\b(canonicalCreditReport|deterministicCreditReportPipeline|pdfTextExtractor|ocrEvidence|extractCanonical|parseCreditReport|ingestCorePipeline)\b/i,
    );
    expect(deliverySources).not.toMatch(
      /\b(extractViolationEvidence|fireViolation|detectViolations|evaluatePacketReadinessForIssues|validateDisputePacketReadiness|adminOverride|directFurnisher)\b/i,
    );
    expect(deliverySources).not.toMatch(
      /\b(activateRuntime|activateRegistry|regulationRuntimeTruth|staticRuntimeMappings\s*=)\b/i,
    );
    expect(deliverySources).not.toMatch(/\bfetch\s*\(\s*['"]https?:/i);
    expect(deliverySources).not.toMatch(/\bgenerateDisputePacketPDF\s*\(/i);
  });
});
