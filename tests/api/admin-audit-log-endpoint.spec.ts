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
    fn: {
      count: vi.fn(() => ({ as: vi.fn((alias: string) => alias) })),
    },
  },
  getServerUserSession: vi.fn(),
}));

vi.mock("../../helpers/db", () => ({
  db: mocks.db,
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: mocks.getServerUserSession,
}));

import { handle as listAdminAuditLogs } from "../../endpoints/admin/audit-logs_GET";
import { handle as listLegacyAuditLogs } from "../../endpoints/audit/log_GET";

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
}

function queueResults(...results: QueryResult[]) {
  mocks.queryQueue.push(...results);
}

function getRequest(path: string, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${path}`, {
    method: "GET",
    headers: {
      "user-agent": "synthetic-admin-audit-test",
      ...headers,
    },
  });
}

function currentUser(role = "admin") {
  return {
    id: role === "admin" ? 101 : role === "support" ? 202 : 303,
    role,
    email: `synthetic.${role}@example.invalid`,
    displayName: `Synthetic ${role}`,
    organizationId: 1000,
  };
}

function sensitiveDetails(overrides: Record<string, unknown> = {}) {
  return {
    action: "synthetic_audit_event",
    requestId: "req_synthetic_001",
    route: "/_api/synthetic/safe-summary",
    summary: "Synthetic safe audit summary.",
    password: "SYNTHETIC_PASSWORD_SHOULD_NOT_APPEAR",
    passwordHash: "$2b$12$SYNTHETIC_PASSWORD_HASH_SHOULD_NOT_APPEAR",
    token: "SYNTHETIC_TOKEN_SHOULD_NOT_APPEAR",
    sessionCookie: "SYNTHETIC_SESSION_COOKIE_SHOULD_NOT_APPEAR",
    authorization: "Bearer SYNTHETIC_AUTH_HEADER_SHOULD_NOT_APPEAR",
    apiKey: "sk-SYNTHETICAPIKEYSHOULDNOTAPPEAR123456",
    privateKey: "-----BEGIN PRIVATE KEY-----SYNTHETIC_PRIVATE_KEY_SHOULD_NOT_APPEAR",
    sin: "123-456-789",
    cardNumber: "1234567890123456",
    secretRawReportText: "SYNTHETIC_RAW_REPORT_TEXT_SHOULD_NOT_APPEAR",
    secretRawPdfText: "SYNTHETIC_RAW_PDF_TEXT_SHOULD_NOT_APPEAR",
    secretPacketContent: "SYNTHETIC_PACKET_CONTENT_SHOULD_NOT_APPEAR",
    secretStorageUrl:
      "local:evidence/101/SYNTHETIC_PRIVATE_STORAGE_PATH_SHOULD_NOT_APPEAR?X-Goog-Signature=secret",
    secretDatabaseUrl: "postgres://synthetic:secret@localhost:5432/creditregulatorpro",
    nested: {
      cookie: "SYNTHETIC_NESTED_COOKIE_SHOULD_NOT_APPEAR",
      safeHash: "a".repeat(64),
    },
    ...overrides,
  };
}

function auditRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 7001,
    actionType: "UPDATE",
    entityType: "SYSTEM",
    entityId: 9001,
    userId: 101,
    details: sensitiveDetails(),
    status: "SUCCESS",
    errorMessage: null,
    ipAddress: "203.0.113.10",
    userAgent: "synthetic-admin-audit-test",
    region: "CA",
    timestamp: new Date("2026-01-01T00:00:00.000Z"),
    userEmail: "synthetic.admin@example.invalid",
    userDisplayName: "Synthetic Admin",
    ...overrides,
  };
}

function expectNoSensitiveLeak(value: unknown) {
  const text = JSON.stringify(value);
  expect(text).not.toContain("SYNTHETIC_PASSWORD_SHOULD_NOT_APPEAR");
  expect(text).not.toContain("SYNTHETIC_PASSWORD_HASH_SHOULD_NOT_APPEAR");
  expect(text).not.toContain("SYNTHETIC_TOKEN_SHOULD_NOT_APPEAR");
  expect(text).not.toContain("SYNTHETIC_SESSION_COOKIE_SHOULD_NOT_APPEAR");
  expect(text).not.toContain("SYNTHETIC_AUTH_HEADER_SHOULD_NOT_APPEAR");
  expect(text).not.toContain("SYNTHETIC_PRIVATE_KEY_SHOULD_NOT_APPEAR");
  expect(text).not.toContain("SYNTHETIC_RAW_REPORT_TEXT_SHOULD_NOT_APPEAR");
  expect(text).not.toContain("SYNTHETIC_RAW_PDF_TEXT_SHOULD_NOT_APPEAR");
  expect(text).not.toContain("SYNTHETIC_PACKET_CONTENT_SHOULD_NOT_APPEAR");
  expect(text).not.toContain("SYNTHETIC_PRIVATE_STORAGE_PATH_SHOULD_NOT_APPEAR");
  expect(text).not.toContain("SYNTHETIC_NESTED_COOKIE_SHOULD_NOT_APPEAR");
  expect(text).not.toMatch(/\$2[aby]\$/i);
  expect(text).not.toMatch(/\b123[-\s]?456[-\s]?789\b/);
  expect(text).not.toMatch(/\b1234567890123456\b/);
  expect(text).not.toMatch(/Bearer\s+SYNTHETIC/i);
  expect(text).not.toMatch(/sk-SYNTHETIC/i);
  expect(text).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
  expect(text).not.toMatch(/postgres:\/\/synthetic/i);
  expect(text).not.toMatch(/X-Goog-|AWSAccessKeyId|Signature=/i);
}

function whereValues(column: string) {
  return mocks.operations
    .filter((operation) => operation.method === "where" && operation.args[0] === column)
    .map((operation) => operation.args);
}

function limitValues() {
  return mocks.operations
    .filter((operation) => operation.method === "limit")
    .map((operation) => operation.args[0]);
}

function offsetValues() {
  return mocks.operations
    .filter((operation) => operation.method === "offset")
    .map((operation) => operation.args[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queryQueue.length = 0;
  mocks.operations.length = 0;
  installDbHarness();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.getServerUserSession.mockResolvedValue({ user: currentUser("admin") });
});

describe("admin audit-log endpoint coverage", () => {
  it("enforces admin-only access and ignores client-supplied role escalation", async () => {
    mocks.getServerUserSession.mockRejectedValueOnce(new NotAuthenticatedError());
    const unauthenticated = await listAdminAuditLogs(getRequest("/_api/admin/audit-logs"));

    expect(unauthenticated.status).toBe(401);
    await expect(unauthenticated.json()).resolves.toEqual({ error: "Not authenticated" });
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();

    mocks.getServerUserSession.mockResolvedValueOnce({ user: currentUser("user") });
    const userDenied = await listAdminAuditLogs(
      getRequest("/_api/admin/audit-logs", {
        "x-user-role": "admin",
        "x-client-requested-role": "admin",
      }),
    );

    expect(userDenied.status).toBe(403);
    await expect(userDenied.json()).resolves.toEqual({ error: "Admin privileges required" });
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();

    mocks.getServerUserSession.mockResolvedValueOnce({ user: currentUser("support") });
    const supportDenied = await listAdminAuditLogs(getRequest("/_api/admin/audit-logs"));

    expect(supportDenied.status).toBe(403);
    await expect(supportDenied.json()).resolves.toEqual({ error: "Admin privileges required" });
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
  });

  it("lets admins list synthetic audit entries with default bounded pagination and safe summaries", async () => {
    queueResults(
      {
        execute: [
          auditRow({
            id: 7001,
            actionType: "UPDATE",
            entityType: "SYSTEM",
            details: sensitiveDetails({
              action: "runtime_bridge_mapping_reviewed",
              bridgeMode: "advisory",
              runtimeSourceUsed: "static_runtime",
              dbRegistryRuntimeTruth: false,
            }),
          }),
          auditRow({
            id: 7002,
            actionType: "PACKET_GENERATED",
            entityType: "PACKET",
            entityId: 8002,
            details: sensitiveDetails({
              action: "packet_generated",
              packetId: 8002,
              packetSummary: "Synthetic packet generated without raw body.",
            }),
          }),
          auditRow({
            id: 7003,
            actionType: "UPLOAD",
            entityType: "EVIDENCE_EVENT",
            entityId: 8003,
            details: sensitiveDetails({
              action: "evidence_attachment_uploaded",
              fileName: "synthetic-evidence.pdf",
              fileType: "application/pdf",
            }),
          }),
          auditRow({
            id: 7004,
            actionType: "UPDATE",
            entityType: "TRADELINE",
            entityId: 8004,
            details: sensitiveDetails({
              action: "violation_correction_finalized",
              correctionId: 8004,
              trainingNoteOnly: true,
              manualOnly: true,
              truthActivation: "manual_review_only",
            }),
          }),
        ],
      },
      { first: { count: "4" } },
    );

    const response = await listAdminAuditLogs(getRequest("/_api/admin/audit-logs"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.total).toBe(4);
    expect(body.logs).toHaveLength(4);
    expect(body.logs[0]).toMatchObject({
      id: 7001,
      actionType: "UPDATE",
      entityType: "SYSTEM",
      userEmail: "synthetic.admin@example.invalid",
      errorSeverity: null,
      errorFingerprint: null,
      requestId: "req_synthetic_001",
      routeContext: "/_api/synthetic/safe-summary",
    });
    expect(body.logs[0].details).toMatchObject({
      action: "runtime_bridge_mapping_reviewed",
      bridgeMode: "advisory",
      runtimeSourceUsed: "static_runtime",
      dbRegistryRuntimeTruth: false,
      password: "[REDACTED]",
      token: "[REDACTED]",
      sin: "[REDACTED]",
      cardNumber: "[REDACTED]",
    });
    expect(body.logs.map((log: { id: number }) => log.id)).toEqual([7001, 7002, 7003, 7004]);
    expect(mocks.operations).toContainEqual(
      expect.objectContaining({ method: "orderBy", args: ["auditLog.timestamp", "desc"] }),
    );
    expect(limitValues()).toContain(100);
    expect(offsetValues()).toContain(0);
    expect(JSON.stringify(body)).not.toMatch(/DB registry is runtime truth|active runtime truth/i);
    expect(JSON.stringify(body)).not.toMatch(/automatically active truth/i);
    expectNoSensitiveLeak(body);
  });

  it("applies supported filters and explicit safe pagination without adding unsupported filters", async () => {
    queueResults({ execute: [auditRow()] }, { first: { count: 1 } });

    const response = await listAdminAuditLogs(
      getRequest(
        "/_api/admin/audit-logs?actionType=PACKET_GENERATED&entityType=PACKET&status=SUCCESS&userId=101&email=synthetic.admin%40example.invalid&startDate=2026-01-01&endDate=2026-01-31&limit=25&offset=50&component=parser&search=raw",
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ total: 1 });
    expect(whereValues("auditLog.actionType")).toContainEqual(["auditLog.actionType", "=", "PACKET_GENERATED"]);
    expect(whereValues("auditLog.entityType")).toContainEqual(["auditLog.entityType", "=", "PACKET"]);
    expect(whereValues("auditLog.status")).toContainEqual(["auditLog.status", "=", "SUCCESS"]);
    expect(whereValues("auditLog.userId")).toContainEqual(["auditLog.userId", "=", 101]);
    expect(whereValues("auditLog.timestamp").map((entry) => entry[1])).toEqual(
      expect.arrayContaining([">=", "<"]),
    );
    expect(mocks.operations.filter((operation) => operation.method === "where" && operation.args.length === 1)).toHaveLength(2);
    expect(limitValues()).toContain(25);
    expect(offsetValues()).toContain(50);
    expect(JSON.stringify(mocks.operations)).not.toMatch(/component|search|source|mode/i);
  });

  it("returns safe validation errors for invalid or excessive pagination inputs before DB access", async () => {
    const excessive = await listAdminAuditLogs(getRequest("/_api/admin/audit-logs?limit=201"));

    expect(excessive.status).toBe(400);
    const excessiveBody = await excessive.json();
    expect(excessiveBody.error).toEqual(expect.any(String));
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
    expectNoSensitiveLeak(excessiveBody);

    const invalid = await listAdminAuditLogs(getRequest("/_api/admin/audit-logs?limit=-1&offset=-10"));

    expect(invalid.status).toBe(400);
    const invalidBody = await invalid.json();
    expect(invalidBody.error).toEqual(expect.any(String));
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
    expectNoSensitiveLeak(invalidBody);
  });

  it("supports severity filtering over sanitized error logs without leaking tokenized error details", async () => {
    queueResults({
      execute: [
        auditRow({
          id: 7101,
          actionType: "LOGIN_FAILED",
          entityType: "USER_ACCOUNT",
          status: "FAILURE",
          errorMessage:
            "Unauthorized synthetic request failed at /admin?token=SYNTHETIC_SESSION_COOKIE_SHOULD_NOT_APPEAR&api_key=sk-SYNTHETICAPIKEYSHOULDNOTAPPEAR123456",
          details: sensitiveDetails({
            action: "login_failed",
            route: "/_api/auth/login_with_password",
          }),
        }),
        auditRow({
          id: 7102,
          actionType: "UPDATE",
          entityType: "SYSTEM",
          status: "FAILURE",
          errorMessage: "Synthetic validation failure",
          details: sensitiveDetails({
            action: "synthetic_low_severity_event",
            route: "/_api/synthetic/low",
          }),
        }),
      ],
    });

    const response = await listAdminAuditLogs(getRequest("/_api/admin/audit-logs?severity=HIGH&limit=5&offset=0"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.total).toBe(1);
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0]).toMatchObject({
      id: 7101,
      errorSeverity: "HIGH",
      errorFingerprint: expect.stringMatching(/^[a-f0-9]{12}$/),
      requestId: "req_synthetic_001",
      routeContext: "/_api/auth/login_with_password",
    });
    expect(body.logs[0].errorMessage).toContain("token=[REDACTED]");
    expect(body.logs[0].errorMessage).toContain("api_key=[REDACTED]");
    expect(limitValues()).toContain(200);
    expect(offsetValues()).toContain(0);
    expectNoSensitiveLeak(body);
  });

  it("keeps the legacy audit log endpoint admin-only and sanitized under its current contract", async () => {
    mocks.getServerUserSession.mockResolvedValueOnce({ user: currentUser("support") });
    const supportDenied = await listLegacyAuditLogs(getRequest("/_api/audit/log"));

    expect(supportDenied.status).toBe(403);
    await expect(supportDenied.json()).resolves.toEqual({ error: "Unauthorized: Admin access required" });

    queueResults({ execute: [auditRow({ id: 7201 })] }, { first: { count: 1 } });

    const adminResponse = await listLegacyAuditLogs(
      getRequest("/_api/audit/log?actionType=UPDATE&entityType=SYSTEM&status=SUCCESS&userId=101&limit=10&offset=5"),
    );

    expect(adminResponse.status).toBe(200);
    const body = await adminResponse.json();
    expect(body).toMatchObject({
      total: 1,
      logs: [expect.objectContaining({ id: 7201, details: expect.any(Object) })],
    });
    expect(whereValues("auditLog.userId")).toContainEqual(["auditLog.userId", "=", 101]);
    expect(whereValues("auditLog.actionType")).toContainEqual(["auditLog.actionType", "=", "UPDATE"]);
    expect(limitValues()).toContain(10);
    expect(offsetValues()).toContain(5);
    expectNoSensitiveLeak(body);
  });

  it("keeps audit endpoint source boundaries away from parser, evidence extraction, packet mutation, and runtime activation paths", () => {
    const auditSources = [
      "endpoints/admin/audit-logs_GET.ts",
      "endpoints/audit/log_GET.ts",
      "helpers/auditLogSanitizer.ts",
      "helpers/auditLogDisplay.ts",
      "pages/admin-activity-logs.tsx",
      "pages/admin-activity-logs.pageLayout.tsx",
    ]
      .map((path) => readFileSync(resolve(path), "utf8"))
      .join("\n");

    expect(auditSources).not.toMatch(
      /\b(canonicalCreditReport|deterministicCreditReportPipeline|pdfTextExtractor|ocrEvidence|extractCanonical|parseCreditReport|ingestCorePipeline)\b/i,
    );
    expect(auditSources).not.toMatch(
      /\b(extractViolationEvidence|fireViolation|validateDisputePacketReadiness|evaluatePacketReadiness|buildDisputePacketPreview|packetWording|directFurnisher)\b/i,
    );
    expect(auditSources).not.toMatch(
      /\b(activateRuntime|activateRegistry|regulationRuntimeTruth|adminOverride|staticRuntimeMappings\s*=)\b/i,
    );
  });
});
