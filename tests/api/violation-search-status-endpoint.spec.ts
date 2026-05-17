import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotAuthenticatedError } from "../../helpers/getSetServerSession";
import { evaluatePacketReadinessForIssues, type PacketReadinessIssueInput } from "../../helpers/disputePacketService";

type QueryResult = {
  execute?: unknown[];
  first?: unknown;
  firstOrThrow?: unknown;
  throwOnExecute?: unknown;
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
  },
  getServerUserSession: vi.fn(),
  shouldSuppressStaleReportingViolation: vi.fn(),
  detectResponseDeficiencies: vi.fn(),
  calculateTimingDrift: vi.fn(),
  selectNextVector: vi.fn(),
  calculateResponseDeadline: vi.fn(),
  executeEscalationPath: vi.fn(),
}));

vi.mock("../../helpers/db", () => ({
  db: mocks.db,
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: mocks.getServerUserSession,
}));

vi.mock("../../helpers/staleReportingGuard", () => ({
  shouldSuppressStaleReportingViolation: mocks.shouldSuppressStaleReportingViolation,
}));

vi.mock("../../helpers/obligationTestEngine", () => ({
  detectResponseDeficiencies: mocks.detectResponseDeficiencies,
  calculateTimingDrift: mocks.calculateTimingDrift,
  selectNextVector: mocks.selectNextVector,
  calculateResponseDeadline: mocks.calculateResponseDeadline,
  executeEscalationPath: mocks.executeEscalationPath,
}));

import { handle as listViolations } from "../../endpoints/creditor-validation/list_GET";
import { handle as updateViolation } from "../../endpoints/creditor-validation/update_POST";
import { handle as dismissViolation } from "../../endpoints/creditor-validation/dismiss_POST";
import { handle as deleteViolation } from "../../endpoints/creditor-validation/delete_POST";
import { handle as getUploadResults } from "../../endpoints/upload-results/get_GET";

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
  builder.returningAll = vi.fn(() => builder);
  builder.execute = vi.fn(async () => {
    if (result.throwOnExecute) throw result.throwOnExecute;
    return result.execute ?? [];
  });
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
}

function queueResults(...results: QueryResult[]) {
  mocks.queryQueue.push(...results);
}

function getRequest(path: string) {
  return new Request(`http://localhost${path}`, { method: "GET" });
}

function postRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "synthetic-violation-status-test" },
    body: JSON.stringify(body),
  });
}

function listRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 301,
    creditorId: 401,
    obligationType: "DATA_VALIDATION",
    obligationState: "CHALLENGED",
    obligationSequence: 1,
    disputeVector: "METRO2_ACCURACY",
    lastChallengeDate: new Date("2026-01-02T00:00:00.000Z"),
    responseDeadline: new Date("2026-02-02T00:00:00.000Z"),
    responsesReceived: 0,
    metro2Version: "synthetic-metro2",
    statutoryBasis: "Synthetic reference only",
    severity: "HIGH",
    omissions: null,
    validationStatus: "PENDING",
    escalationPath: null,
    notes: "Synthetic endpoint note.",
    lastTestDate: null,
    tradelineId: 801,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    violationCategory: "BALANCE_CALCULATION_VIOLATION",
    confidenceScore: 91,
    autoGenerated: true,
    userExplanation: "Synthetic explanation with no raw report text.",
    technicalDetails: {
      province: "ON",
      evidenceLocation: {
        fieldKey: "tradelines[0].balance",
        pageNumber: 2,
        sourceTextHash: "a".repeat(64),
      },
    },
    recommendedAction: "Review the synthetic evidence reference.",
    detectedAt: new Date("2026-01-01T00:00:00.000Z"),
    userStatus: "active",
    userStatusReason: null,
    userStatusUpdatedAt: null,
    creditorName: "Synthetic Creditor",
    tradelineAccountNumber: "SYN-****-0001",
    tradelineDisplayStatus: "Open",
    tradelineCurrentBalance: "200",
    tradelineBalance: "200",
    tradelineBureauName: "TransUnion Canada",
    tradelineAccountType: "credit_card",
    tradelineCollectionAgencyName: null,
    tradelineOriginalCreditorName: null,
    tradelineIsCollectionAccount: false,
    tradelineStatus: "Open",
    tradelineDateClosed: null,
    tradelineDatePaidSettled: null,
    ...overrides,
  };
}

function currentTest(overrides: Record<string, unknown> = {}) {
  return {
    id: 301,
    creditorId: 401,
    tradelineId: 801,
    tradelineUserId: 10,
    userId: 10,
    obligationType: "DATA_VALIDATION",
    obligationState: "CHALLENGED",
    obligationSequence: 1,
    disputeVector: "METRO2_ACCURACY",
    lastChallengeDate: new Date("2026-01-02T00:00:00.000Z"),
    responseDeadline: new Date("2026-02-02T00:00:00.000Z"),
    responsesReceived: 0,
    escalationPath: null,
    notes: "Synthetic endpoint note.",
    ...overrides,
  };
}

function updatedTest(overrides: Record<string, unknown> = {}) {
  return {
    ...currentTest(),
    obligationState: "NO_RESPONSE",
    updatedAt: new Date("2026-01-03T00:00:00.000Z"),
    ...overrides,
  };
}

function issue(overrides: Partial<PacketReadinessIssueInput> = {}): PacketReadinessIssueInput {
  return {
    issueId: 301,
    userId: 10,
    tradelineId: 801,
    bureauId: 901,
    userStatus: "active",
    validationStatus: "PENDING",
    technicalDetails: {
      extractionConfidenceGate: {
        status: "confirmed",
        packetReady: true,
        confidenceScore: 95,
        requiresManualReview: false,
        reasonCodes: [],
      },
    },
    evidenceReference: "Source report #synthetic; field: balance; page 2",
    packetTypes: ["credit_bureau"],
    ...overrides,
  };
}

function whereValues(column: string) {
  return mocks.operations
    .filter((operation) => operation.method === "where" && operation.args[0] === column)
    .map((operation) => operation.args);
}

function valuesFor(table: string) {
  return mocks.operations
    .filter((operation) => operation.table === table && operation.method === "values")
    .map((operation) => operation.args[0]);
}

function setFor(table: string) {
  return mocks.operations
    .filter((operation) => operation.table === table && operation.method === "set")
    .map((operation) => operation.args[0]);
}

function responseTextIsPrivacySafe(value: unknown) {
  const text = JSON.stringify(value);
  expect(text).not.toMatch(/\b\d{3}-\d{3}-\d{3}\b/);
  expect(text).not.toMatch(/fullSin|socialInsurance|rawExtractedText|rawReportText|sourceText":/i);
  expect(text).not.toContain("SYNTHETIC_RAW_REPORT_TEXT_SHOULD_NOT_APPEAR");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queryQueue.length = 0;
  mocks.operations.length = 0;
  installDbHarness();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);

  mocks.getServerUserSession.mockResolvedValue({ user: { id: 10, role: "user" } });
  mocks.shouldSuppressStaleReportingViolation.mockReturnValue(false);
  mocks.detectResponseDeficiencies.mockReturnValue(["Synthetic deficiency"]);
  mocks.calculateTimingDrift.mockReturnValue(3);
  mocks.selectNextVector.mockReturnValue({ isExhausted: false, nextVector: "METRO2_ACCURACY", nextSequenceId: 2 });
  mocks.calculateResponseDeadline.mockReturnValue(new Date("2026-03-02T00:00:00.000Z"));
  mocks.executeEscalationPath.mockReturnValue({
    escalationData: JSON.stringify({ type: "SEND_NEXT_SYNTHETIC_CHALLENGE" }),
    nextDeadline: new Date("2026-03-02T00:00:00.000Z"),
  });
});

describe("violation search and status endpoints", () => {
  it("lets an authenticated user list only their own synthetic violations with compact evidence metadata", async () => {
    queueResults({ execute: [listRow()] }, { execute: [listRow()] });

    const response = await listViolations(getRequest("/_api/creditor-validation/list?limit=10"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      total: 1,
      obligationTests: [
        expect.objectContaining({
          id: 301,
          tradelineId: 801,
          creditorName: "Synthetic Creditor",
          violationCategory: "BALANCE_CALCULATION_VIOLATION",
          userStatus: "active",
          tradelineAccountNumber: "SYN-****-0001",
        }),
      ],
    });
    expect(whereValues("tradeline.userId")).toContainEqual(["tradeline.userId", "=", 10]);
    expect(JSON.stringify(body)).not.toContain("other-user-synthetic-marker");
    responseTextIsPrivacySafe(body);
  });

  it("applies supported list filters without adding unsupported search parameters", async () => {
    queueResults({ execute: [] }, { execute: [] });

    const response = await listViolations(
      getRequest(
        "/_api/creditor-validation/list?creditorId=401&obligationState=NO_RESPONSE&tradelineId=801&limit=5&offset=2",
      ),
    );

    expect(response.status).toBe(200);
    expect(whereValues("creditorObligationTest.creditorId")).toContainEqual([
      "creditorObligationTest.creditorId",
      "=",
      401,
    ]);
    expect(whereValues("creditorObligationTest.obligationState")).toContainEqual([
      "creditorObligationTest.obligationState",
      "=",
      "NO_RESPONSE",
    ]);
    expect(whereValues("creditorObligationTest.tradelineId")).toContainEqual([
      "creditorObligationTest.tradelineId",
      "=",
      801,
    ]);
    expect(mocks.operations).toContainEqual(expect.objectContaining({ method: "limit", args: [5] }));
    expect(mocks.operations).toContainEqual(expect.objectContaining({ method: "offset", args: [2] }));
    expect(JSON.stringify(mocks.operations)).not.toMatch(/violationCategory|userStatus|evidencePresence|dateRange/i);
  });

  it("keeps non-owner list attempts scoped by session ownership and denies non-owner mutations", async () => {
    queueResults({ execute: [] }, { execute: [] });
    const listResponse = await listViolations(getRequest("/_api/creditor-validation/list?tradelineId=999"));
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({ total: 0, obligationTests: [] });
    expect(whereValues("creditorObligationTest.tradelineId")).toContainEqual([
      "creditorObligationTest.tradelineId",
      "=",
      999,
    ]);
    expect(whereValues("tradeline.userId")).toContainEqual(["tradeline.userId", "=", 10]);

    mocks.operations.length = 0;
    queueResults({ first: currentTest({ tradelineUserId: 99 }) });
    const updateResponse = await updateViolation(
      postRequest("/_api/creditor-validation/update", { id: 301, responseReceived: false }),
    );
    expect(updateResponse.status).toBe(403);
    expect(mocks.db.updateTable).not.toHaveBeenCalled();

    mocks.operations.length = 0;
    queueResults({ first: currentTest({ userId: 99 }) });
    const dismissResponse = await dismissViolation(
      postRequest("/_api/creditor-validation/dismiss", {
        violationId: 301,
        status: "dismissed",
        reason: "Synthetic non-owner attempt.",
      }),
    );
    expect(dismissResponse.status).toBe(403);
    expect(mocks.db.updateTable).not.toHaveBeenCalled();

    mocks.operations.length = 0;
    queueResults({ first: currentTest({ tradelineUserId: 99 }) });
    const deleteResponse = await deleteViolation(
      postRequest("/_api/creditor-validation/delete", { id: 301 }),
    );
    expect(deleteResponse.status).toBe(403);
    expect(mocks.db.deleteFrom).not.toHaveBeenCalled();
  });

  it("treats admin as cross-owner capable and support as non-admin scoped under the current contract", async () => {
    mocks.getServerUserSession.mockResolvedValueOnce({ user: { id: 50, role: "admin" } });
    queueResults({ execute: [listRow({ tradelineId: 880, tradelineAccountNumber: "SYN-****-ADMIN" })] }, { execute: [listRow({ tradelineId: 880, tradelineAccountNumber: "SYN-****-ADMIN" })] });

    const adminResponse = await listViolations(getRequest("/_api/creditor-validation/list"));
    expect(adminResponse.status).toBe(200);
    await expect(adminResponse.json()).resolves.toMatchObject({ total: 1 });
    expect(whereValues("tradeline.userId")).toEqual([]);

    mocks.operations.length = 0;
    mocks.getServerUserSession.mockResolvedValueOnce({ user: { id: 60, role: "support" } });
    queueResults({ first: currentTest({ userId: 99 }) });
    const supportDismiss = await dismissViolation(
      postRequest("/_api/creditor-validation/dismiss", {
        violationId: 301,
        status: "dismissed",
        reason: "Synthetic support cross-owner attempt.",
      }),
    );

    expect(supportDismiss.status).toBe(403);
    expect(mocks.db.updateTable).not.toHaveBeenCalled();
  });

  it("denies upload-result detail access before another user's violations are queried", async () => {
    queueResults({
      first: {
        id: 601,
        userId: 99,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        data: { fileName: "synthetic-report.pdf", tradelineIds: [801] },
        tradelineId: null,
      },
    });

    const response = await getUploadResults(getRequest("/_api/upload-results/get?artifactId=601"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized access to artifact" });
    expect(mocks.db.selectFrom).toHaveBeenCalledTimes(1);
  });

  it("persists dismiss status and rejects invalid status without changing canonical facts", async () => {
    queueResults(
      { first: currentTest({ userId: 10 }) },
      { firstOrThrow: updatedTest({ userStatus: "dismissed", userStatusReason: "Synthetic user-reviewed dismissal." }) },
    );

    const response = await dismissViolation(
      postRequest("/_api/creditor-validation/dismiss", {
        violationId: 301,
        status: "dismissed",
        reason: "Synthetic user-reviewed dismissal.",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      obligationTest: expect.objectContaining({
        id: 301,
        userStatus: "dismissed",
        userStatusReason: "Synthetic user-reviewed dismissal.",
      }),
    });
    expect(setFor("creditorObligationTest")[0]).toMatchObject({
      userStatus: "dismissed",
      userStatusReason: "Synthetic user-reviewed dismissal.",
    });
    expect(JSON.stringify(setFor("creditorObligationTest")[0])).not.toMatch(
      /canonical|parse|ocr|violationCategory|packetReady/i,
    );
    expect(valuesFor("auditLog")).toEqual([]);

    mocks.operations.length = 0;
    mocks.db.updateTable.mockClear();
    const invalid = await dismissViolation(
      postRequest("/_api/creditor-validation/dismiss", {
        violationId: 301,
        status: "active",
      }),
    );

    expect(invalid.status).toBe(400);
    expect(mocks.db.updateTable).not.toHaveBeenCalled();
  });

  it("updates response status through the existing challenge log path without audit-log overexposure", async () => {
    queueResults(
      { first: currentTest() },
      { execute: [] },
      { firstOrThrow: updatedTest() },
      {},
    );

    const response = await updateViolation(
      postRequest("/_api/creditor-validation/update", {
        id: 301,
        responseReceived: false,
        notes: "Synthetic no-response status note.",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      obligationTest: expect.objectContaining({ id: 301, obligationState: "NO_RESPONSE" }),
      deficiencies: ["No response received from creditor"],
      timingDrift: 3,
      nextAction: "SEND_NEXT_SYNTHETIC_CHALLENGE",
      isExhausted: false,
    });
    expect(setFor("creditorObligationTest")[0]).toMatchObject({
      obligationState: "NO_RESPONSE",
      notes: "Synthetic no-response status note.",
    });
    expect(valuesFor("obligationChallengeLog")[0]).toMatchObject({
      tradelineId: 801,
      challengeBasis: "METRO2_ACCURACY",
      challengeVector: "METRO2_ACCURACY",
      severity: "WARNING",
      responseReceived: false,
    });
    responseTextIsPrivacySafe(valuesFor("obligationChallengeLog")[0]);
    expect(valuesFor("auditLog")).toEqual([]);
  });

  it("deletes through the current hard-delete contract and denies unauthenticated requests", async () => {
    queueResults({ first: currentTest({ tradelineUserId: 10 }) }, { first: { numDeletedRows: 1n } });

    const response = await deleteViolation(postRequest("/_api/creditor-validation/delete", { id: 301 }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(whereValues("id")).toContainEqual(["id", "=", 301]);
    expect(valuesFor("auditLog")).toEqual([]);

    mocks.getServerUserSession.mockRejectedValueOnce(new NotAuthenticatedError());
    const unauthenticated = await deleteViolation(
      postRequest("/_api/creditor-validation/delete", { id: 301 }),
    );

    expect(unauthenticated.status).toBe(401);
    await expect(unauthenticated.json()).resolves.toEqual({ error: "Not authenticated" });
  });

  it("keeps dismissed and missing-evidence findings blocked by existing packet readiness rules", () => {
    const readiness = evaluatePacketReadinessForIssues(
      { id: 10, role: "user" as const },
      { packetType: "credit_bureau", selectedIssueIds: [301, 302, 303] },
      [
        issue({ issueId: 301, userStatus: "dismissed" }),
        issue({ issueId: 302, evidenceReference: "Needs manual review" }),
        issue({ issueId: 303, evidenceReference: "" }),
      ],
    );

    expect(readiness.packetReady).toBe(false);
    expect(readiness.reasonCodes).toEqual(
      expect.arrayContaining(["DISMISSED_FINDING", "MISSING_REQUIRED_EVIDENCE", "MANUAL_REVIEW_REQUIRED"]),
    );
    expect(readiness.ineligibleFindingIds).toEqual([301, 302, 303]);
  });

  it("keeps violation search/status endpoints outside parser, OCR, packet wording, runtime registry, override, and furnisher paths", () => {
    const sources = [
      "endpoints/creditor-validation/list_GET.ts",
      "endpoints/creditor-validation/update_POST.ts",
      "endpoints/creditor-validation/dismiss_POST.ts",
      "endpoints/creditor-validation/delete_POST.ts",
      "endpoints/upload-results/get_GET.ts",
    ].map((file) => readFileSync(join(process.cwd(), file), "utf8"));
    const combined = sources.join("\n");

    expect(combined).not.toMatch(
      /from\s+["'][^"']*(parser|canonical|ocr|runtime-bridge|regulationRuntime|adminOverride|furnisher)/i,
    );
    expect(combined).not.toMatch(
      /validateDisputePacketReadiness|buildSimpleDisputePacketContent|packetReady|packet wording|active_limited_runtime|selectRuntimeReference|activate.*registry|direct\s+furnisher/i,
    );
  });
});
