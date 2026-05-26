import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerUserSession: vi.fn(),
  detectResetRuntimeContext: vi.fn(),
  runReset: vi.fn(),
  dbInsertInto: vi.fn(),
  dbValues: vi.fn(),
  dbReturning: vi.fn(),
  dbExecuteTakeFirstOrThrow: vi.fn(),
  productionDisabledMessage: "Production environment detected. Platform reset is disabled in production.",
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: mocks.getServerUserSession,
}));

vi.mock("../../scripts/reset-platform.mjs", () => ({
  PLATFORM_RESET_PRODUCTION_DISABLED_MESSAGE: mocks.productionDisabledMessage,
  buildResetRuntimeDiagnostics: (runtime: {
    environment?: { kind?: string; reason?: string };
    database?: { host?: string; database?: string };
    storage?: { provider?: string; root?: string };
  }) => ({
    detectedEnvironment: String(runtime?.environment?.kind ?? "unknown"),
    databaseHost: String(runtime?.database?.host ?? "(unknown)"),
    databaseName: String(runtime?.database?.database ?? "(unknown)"),
    storageProvider: String(runtime?.storage?.provider ?? "(unknown)"),
    storageRoot: String(runtime?.storage?.root ?? "(unknown)"),
    reason: String(runtime?.environment?.reason ?? ""),
  }),
  detectResetRuntimeContext: mocks.detectResetRuntimeContext,
  parseEmailAllowlist: (value: string | string[] = "") =>
    (Array.isArray(value) ? value : String(value).split(/[,\s;]+/u))
      .map((entry) => String(entry).trim().toLowerCase())
      .filter(Boolean),
  runReset: mocks.runReset,
}));

vi.mock("../../helpers/db", () => ({
  db: {
    insertInto: mocks.dbInsertInto,
  },
}));

import { handle as dryRunPlatformReset } from "../../endpoints/admin/platform-reset/dry-run_POST";
import { handle as confirmPlatformReset } from "../../endpoints/admin/platform-reset/confirm_POST";
import {
  ADMIN_PLATFORM_RESET_HEADER,
  PLATFORM_RESET_CONFIRMATION_PHRASE,
  type PlatformResetResult,
} from "../../endpoints/admin/platform-reset/dry-run_POST.schema";

const runtime = {
  environment: { kind: "staging", reason: "Environment indicates staging." },
  database: {
    source: "FLOOT_DATABASE_URL",
    host: "staging-db.internal",
    port: "5432",
    database: "creditregulatorpro_staging",
  },
  storage: {
    provider: "local_file_storage",
    configuredPath: "document-storage",
    root: "/app/document-storage",
  },
};

const resetResult: PlatformResetResult = {
  event: "platform_reset",
  mode: "dry-run",
  resetScope: "hard",
  generatedAt: "2026-05-25T00:00:00.000Z",
  environment: runtime.environment,
  database: runtime.database,
  preservedSubsystems: ["admin users", "legal references", "parser mappings"],
  preservedTables: ["statute", "parser_field_mapping"],
  adminPreservation: {
    configuredAdminEmails: ["admin@example.test"],
    allowMultiplePreservedAdmins: false,
    preservedAdminCount: 1,
    preservedAdminEmails: ["admin@example.test"],
    requiresExactlyOneAdmin: true,
  },
  userPlan: {
    usersTableMissing: false,
    preservedUsers: [{ id: 1, email: "admin@example.test", role: "admin", reason: "configured_admin_email" }],
    deletedUsers: [{ id: 2, email: "test@example.test", role: "user", reason: "non_canonical_admin_user" }],
    preservedCount: 1,
    deletedCount: 1,
    reportLimit: 200,
  },
  updateResults: [],
  rowsByTable: [
    { table: "report_artifact", count: 2, action: "delete_all" },
    { table: "support_ticket", count: 1, action: "delete_all" },
    { table: "users", count: 1, action: "delete_deleted_users" },
  ],
  identityResults: [],
  filesByTarget: [],
  storage: {
    provider: runtime.storage,
    health: { status: "not_run_dry_run" },
    references: {
      provider: runtime.storage,
      byArea: [{ area: "packet_pdf", references: 1, rows: 1 }],
      totalReferences: 1,
      totalRows: 1,
      localReadable: 0,
      localReferences: [],
      unsupportedReferences: [],
      notFoundReferences: [{ table: "packet", column: "pdf_storage_url", area: "packet_pdf", storageUrl: "local:missing.pdf", count: 1, status: "storage_read_failed:not_found" }],
      failedReferences: [],
    },
    deletion: {
      action: "would_delete_local_storage_references",
      deletedCount: 0,
      deleted: [],
      notFoundReferences: [],
      unsupportedReferences: [],
      failedReferences: [],
    },
  },
  totalRowsMatched: 4,
  totalUpdatesMatched: 0,
  totalFilesMatched: 0,
  validation: [],
};

function jsonRequest(path: string, body: unknown, includeHeader = true) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (includeHeader) headers[ADMIN_PLATFORM_RESET_HEADER] = "1";
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function mockAuditIds(...ids: number[]) {
  mocks.dbValues.mockReturnValue({
    returning: mocks.dbReturning,
  });
  mocks.dbReturning.mockReturnValue({
    executeTakeFirstOrThrow: mocks.dbExecuteTakeFirstOrThrow,
  });
  mocks.dbExecuteTakeFirstOrThrow.mockReset();
  for (const id of ids) {
    mocks.dbExecuteTakeFirstOrThrow.mockResolvedValueOnce({ id });
  }
}

describe("admin platform reset endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RESET_PRESERVE_ADMIN_EMAILS", "");
    mocks.getServerUserSession.mockResolvedValue({
      user: { id: 10, email: "admin@example.test", role: "admin" },
    });
    mocks.detectResetRuntimeContext.mockReturnValue(runtime);
    mocks.runReset.mockResolvedValue(resetResult);
    mocks.dbInsertInto.mockReturnValue({
      values: mocks.dbValues,
    });
    mockAuditIds(501, 502, 503);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("runs dry-run as admin without deleting or writing reset audit rows", async () => {
    const response = await dryRunPlatformReset(jsonRequest("/_api/admin/platform-reset/dry-run", { mode: "hard" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.result.userPlan.deletedCount).toBe(1);
    expect(mocks.runReset).toHaveBeenCalledWith(
      expect.objectContaining({
        execution: "dry-run",
        resetScope: "hard",
        confirmEnv: "staging",
        preserveAdminEmails: ["admin@example.test"],
      }),
      process.env,
    );
    expect(mocks.dbInsertInto).not.toHaveBeenCalled();
  });

  it("blocks non-admin callers before reset work", async () => {
    mocks.getServerUserSession.mockResolvedValueOnce({
      user: { id: 11, email: "support@example.test", role: "support" },
    });

    const response = await dryRunPlatformReset(jsonRequest("/_api/admin/platform-reset/dry-run", { mode: "hard" }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/admin/i);
    expect(mocks.runReset).not.toHaveBeenCalled();
  });

  it("requires the admin platform reset request header", async () => {
    const response = await dryRunPlatformReset(jsonRequest("/_api/admin/platform-reset/dry-run", { mode: "hard" }, false));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/header/i);
    expect(mocks.runReset).not.toHaveBeenCalled();
  });

  it("requires exact confirmation for destructive reset", async () => {
    const response = await confirmPlatformReset(jsonRequest("/_api/admin/platform-reset/confirm", {
      mode: "hard",
      confirmation: "reset staging platform",
      expectedDatabase: runtime.database,
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/RESET STAGING PLATFORM/);
    expect(mocks.runReset).not.toHaveBeenCalled();
    expect(mocks.dbInsertInto).not.toHaveBeenCalled();
  });

  it("audits confirmed reset and binds confirm to the dry-run database target", async () => {
    const response = await confirmPlatformReset(jsonRequest("/_api/admin/platform-reset/confirm", {
      mode: "hard",
      confirmation: PLATFORM_RESET_CONFIRMATION_PHRASE,
      expectedDatabase: runtime.database,
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.auditLogIds).toEqual({ started: 501, completed: 502 });
    expect(mocks.dbInsertInto).toHaveBeenCalledWith("auditLog");
    expect(mocks.dbInsertInto).toHaveBeenCalledTimes(2);
    expect(mocks.runReset).toHaveBeenCalledWith(
      expect.objectContaining({
        execution: "apply",
        resetScope: "hard",
        confirm: true,
        confirmEnv: "staging",
        expectedDatabase: runtime.database,
        preserveAdminEmails: ["admin@example.test"],
        preserveAuditLogIds: [501],
      }),
      process.env,
    );
  });

  it("prefers RESET_PRESERVE_ADMIN_EMAILS over the current admin email", async () => {
    vi.stubEnv("RESET_PRESERVE_ADMIN_EMAILS", "canonical@example.test");

    const response = await dryRunPlatformReset(jsonRequest("/_api/admin/platform-reset/dry-run", { mode: "hard" }));

    expect(response.status).toBe(200);
    expect(mocks.runReset).toHaveBeenCalledWith(
      expect.objectContaining({
        preserveAdminEmails: ["canonical@example.test"],
      }),
      process.env,
    );
  });

  it("refuses production before destructive reset starts", async () => {
    mocks.detectResetRuntimeContext.mockReturnValueOnce({
      ...runtime,
      environment: { kind: "production", reason: "CRP_ENV indicates production." },
    });

    const response = await confirmPlatformReset(jsonRequest("/_api/admin/platform-reset/confirm", {
      mode: "hard",
      confirmation: PLATFORM_RESET_CONFIRMATION_PHRASE,
      expectedDatabase: runtime.database,
    }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain(mocks.productionDisabledMessage);
    expect(body.diagnostics).toMatchObject({
      detectedEnvironment: "production",
      databaseHost: runtime.database.host,
      databaseName: runtime.database.database,
      storageProvider: "local_file_storage",
      storageRoot: "/app/document-storage",
    });
    expect(mocks.runReset).not.toHaveBeenCalled();
    expect(mocks.dbInsertInto).not.toHaveBeenCalled();
  });

  it("refuses unknown reset environments with safe diagnostics", async () => {
    mocks.detectResetRuntimeContext.mockReturnValueOnce({
      ...runtime,
      environment: {
        kind: "unknown",
        reason: "Unable to determine local, staging, or production from environment and database target.",
      },
    });

    const response = await dryRunPlatformReset(jsonRequest("/_api/admin/platform-reset/dry-run", { mode: "hard" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/environment is unknown/i);
    expect(body.diagnostics).toMatchObject({
      detectedEnvironment: "unknown",
      databaseHost: runtime.database.host,
      databaseName: runtime.database.database,
      storageProvider: "local_file_storage",
      storageRoot: "/app/document-storage",
    });
    expect(mocks.runReset).not.toHaveBeenCalled();
    expect(mocks.dbInsertInto).not.toHaveBeenCalled();
  });

  it("fails closed when reset would leave no admin user", async () => {
    mocks.runReset.mockRejectedValueOnce(new Error("Hard platform reset would leave zero admins from RESET_PRESERVE_ADMIN_EMAILS."));

    const response = await confirmPlatformReset(jsonRequest("/_api/admin/platform-reset/confirm", {
      mode: "hard",
      confirmation: PLATFORM_RESET_CONFIRMATION_PHRASE,
      expectedDatabase: runtime.database,
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/zero admins/i);
    expect(mocks.dbInsertInto).toHaveBeenCalledTimes(2);
    expect(mocks.dbValues).toHaveBeenLastCalledWith(expect.objectContaining({
      status: "FAILURE",
      errorMessage: expect.stringMatching(/zero admins/i),
    }));
  });

  it("fails closed when reset would preserve more than one admin", async () => {
    mocks.runReset.mockRejectedValueOnce(new Error("Hard platform reset would preserve more than one admin."));

    const response = await confirmPlatformReset(jsonRequest("/_api/admin/platform-reset/confirm", {
      mode: "hard",
      confirmation: PLATFORM_RESET_CONFIRMATION_PHRASE,
      expectedDatabase: runtime.database,
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/more than one admin/i);
    expect(mocks.dbValues).toHaveBeenLastCalledWith(expect.objectContaining({
      status: "FAILURE",
      errorMessage: expect.stringMatching(/more than one admin/i),
    }));
  });

  it("reports storage conflicts instead of silently ignoring them", async () => {
    mocks.runReset.mockRejectedValueOnce(new Error("Platform reset storage deletion failed for 1 reference(s)."));

    const response = await confirmPlatformReset(jsonRequest("/_api/admin/platform-reset/confirm", {
      mode: "hard",
      confirmation: PLATFORM_RESET_CONFIRMATION_PHRASE,
      expectedDatabase: runtime.database,
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/storage deletion failed/i);
    expect(mocks.dbValues).toHaveBeenLastCalledWith(expect.objectContaining({
      status: "FAILURE",
      errorMessage: expect.stringMatching(/storage deletion failed/i),
    }));
  });
});
