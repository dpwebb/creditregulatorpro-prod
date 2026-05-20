import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = {
  execute?: unknown[];
  first?: unknown;
  firstOrThrow?: unknown;
};

type DbOperation = {
  kind: "select" | "insert" | "update" | "delete";
  table: string;
  method: "where" | "whereRef" | "limit" | "offset" | "orderBy" | "select" | "selectAll";
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
  ensureResponseDocumentSchema: vi.fn(),
}));

vi.mock("../../helpers/db", () => ({
  db: mocks.db,
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: mocks.getServerUserSession,
}));

vi.mock("../../helpers/responseDocumentSchema", () => ({
  ensureResponseDocumentSchema: mocks.ensureResponseDocumentSchema,
}));

vi.mock("../../helpers/supportTicketNotifications", () => ({
  notifyStatusChange: vi.fn(),
  notifyTicketAssigned: vi.fn(),
}));

import { handle as getSupportTicket } from "../../endpoints/support-ticket/get_GET";
import { handle as listRegulatoryNotifications } from "../../endpoints/regulatory-notification/list_GET";
import {
  getResponseDocument,
  listResponseDocuments,
} from "../../helpers/responseDocumentService";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function makeBuilder(table: string, kind: DbOperation["kind"], result: QueryResult = {}) {
  const builder: Record<string, any> = {};
  const chain = (method: DbOperation["method"]) =>
    vi.fn((...args: unknown[]) => {
      mocks.operations.push({ kind, table, method, args });
      return builder;
    });

  for (const method of ["where", "whereRef", "limit", "offset", "orderBy"] as const) {
    builder[method] = chain(method);
  }
  builder.select = chain("select");
  builder.selectAll = chain("selectAll");
  builder.innerJoin = vi.fn(() => builder);
  builder.leftJoin = vi.fn(() => builder);
  builder.values = vi.fn(() => builder);
  builder.set = vi.fn(() => builder);
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

function currentUser(role: "admin" | "support" | "user", id: number) {
  return {
    id,
    role,
    organizationId: 1000,
    displayName: `Synthetic ${role}`,
    email: `${role}@example.invalid`,
  };
}

function getRequest(path: string) {
  return new Request(`http://localhost${path}`, {
    method: "GET",
    headers: { "user-agent": "synthetic-support-privacy-matrix" },
  });
}

function ticketRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 701,
    subject: "Synthetic support ticket",
    description: "Synthetic metadata only.",
    category: "TECHNICAL",
    priority: "MEDIUM",
    status: "OPEN",
    userId: 10,
    assignedAgentId: null,
    createdAt: new Date("2026-05-20T00:00:00.000Z"),
    updatedAt: new Date("2026-05-20T00:00:00.000Z"),
    userDisplayName: "Synthetic Owner",
    assignedAgentName: null,
    ...overrides,
  };
}

function messageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 901,
    ticketId: 701,
    senderId: 10,
    senderRole: "user",
    message: "Synthetic ticket message.",
    isInternalNote: false,
    createdAt: new Date("2026-05-20T00:00:00.000Z"),
    senderDisplayName: "Synthetic Owner",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queryQueue.length = 0;
  mocks.operations.length = 0;
  installDbHarness();
  mocks.ensureResponseDocumentSchema.mockResolvedValue(undefined);
  mocks.getServerUserSession.mockResolvedValue({ user: currentUser("user", 10) });
});

describe("support role privacy matrix", () => {
  it("keeps support scoped as non-admin for reports, packets, and evidence routes", () => {
    const matrix = [
      {
        domain: "report artifacts",
        files: ["endpoints/report-artifact/list_GET.ts", "endpoints/report-artifact/get_GET.ts"],
        required: ["reportArtifact.userId", "user.role !== 'admin'", "user.role === 'admin'"],
      },
      {
        domain: "packets and packet PDFs",
        files: ["endpoints/packet/list_GET.ts", "endpoints/packet/get_GET.ts", "endpoints/packet/pdf_GET.ts"],
        required: ["packet.userId", "user.role !== 'admin'", 'user.role !== "admin"'],
      },
      {
        domain: "evidence events and attachments",
        files: ["endpoints/evidence/list_GET.ts", "endpoints/evidence-attachment/list_GET.ts"],
        required: ["packet.userId", "ownerCheck.userId !== user.id", 'user.role === "admin"'],
      },
    ];

    for (const entry of matrix) {
      const text = entry.files.map(source).join("\n");
      for (const required of entry.required) {
        expect(text, `${entry.domain} must retain ${required}`).toContain(required);
      }
    }
  });

  it("keeps response documents unavailable to support while preserving owner/admin source filters", async () => {
    await expect(
      listResponseDocuments({ limit: 1 }, { id: 60, role: "support" }),
    ).rejects.toThrow("Support role cannot list response documents.");
    await expect(
      getResponseDocument({ responseId: 701 }, { id: 60, role: "support" }),
    ).rejects.toThrow("Support role cannot read response documents.");
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();

    const serviceSource = source("helpers/responseDocumentService.ts");
    expect(serviceSource).toContain('if (isSupport(user)) throw new BusinessRuleError("Support role cannot list response documents.", 403);');
    expect(serviceSource).toContain('if (isSupport(user)) throw new BusinessRuleError("Support role cannot read response documents.", 403);');
    expect(serviceSource).toContain('if (!isAdmin(user)) query = query.where("userId", "=", user.id);');
  });

  it("allows support ticket access only for assigned or open unassigned tickets", async () => {
    mocks.getServerUserSession.mockResolvedValue({ user: currentUser("support", 60) });
    queueResults(
      { first: ticketRow({ status: "IN_PROGRESS", assignedAgentId: 60, assignedAgentName: "Synthetic Support" }) },
      { execute: [messageRow({ isInternalNote: true, senderRole: "support" })] },
    );

    const assigned = await getSupportTicket(getRequest("/_api/support-ticket/get?id=701"));
    expect(assigned.status).toBe(200);
    await expect(assigned.json()).resolves.toMatchObject({
      ticket: expect.objectContaining({ id: 701, assignedAgentId: 60 }),
      messages: [expect.objectContaining({ id: 901 })],
    });

    mocks.operations.length = 0;
    queueResults(
      { first: ticketRow({ status: "OPEN", assignedAgentId: null }) },
      { execute: [messageRow()] },
    );

    const openUnassigned = await getSupportTicket(getRequest("/_api/support-ticket/get?id=702"));
    expect(openUnassigned.status).toBe(200);

    mocks.operations.length = 0;
    queueResults({ first: ticketRow({ status: "CLOSED", assignedAgentId: null }) });

    const closedUnassigned = await getSupportTicket(getRequest("/_api/support-ticket/get?id=703"));
    expect(closedUnassigned.status).toBe(403);
    await expect(closedUnassigned.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("proves ordinary non-owner users are denied and admins can read intended support-ticket records", async () => {
    mocks.getServerUserSession.mockResolvedValueOnce({ user: currentUser("user", 10) });
    queueResults({ first: ticketRow({ userId: 99, assignedAgentId: 60 }) });

    const nonOwner = await getSupportTicket(getRequest("/_api/support-ticket/get?id=704"));
    expect(nonOwner.status).toBe(403);
    await expect(nonOwner.json()).resolves.toEqual({ error: "Forbidden" });

    mocks.getServerUserSession.mockResolvedValueOnce({ user: currentUser("admin", 1) });
    queueResults(
      { first: ticketRow({ userId: 99, assignedAgentId: 77, status: "CLOSED" }) },
      { execute: [messageRow()] },
    );

    const admin = await getSupportTicket(getRequest("/_api/support-ticket/get?id=705"));
    expect(admin.status).toBe(200);
    await expect(admin.json()).resolves.toMatchObject({
      ticket: expect.objectContaining({ id: 701, userId: 99 }),
    });
  });

  it("keeps support-ticket list source restricted to assigned or open unassigned support scope", () => {
    const text = source("endpoints/support-ticket/list_GET.ts");
    expect(text).toContain('user.role === "support"');
    expect(text).toContain('"supportTicket.assignedAgentId", "=", user.id');
    expect(text).toContain('"supportTicket.assignedAgentId", "is", null');
    expect(text).toContain('"supportTicket.status", "=", "OPEN"');
    expect(text).toContain('user.role === "user"');
    expect(text).toContain('"supportTicket.userId", "=", user.id');
  });

  it("keeps representative admin-only routes admin-only for support callers", async () => {
    mocks.getServerUserSession.mockResolvedValue({ user: currentUser("support", 60) });

    const denied = await listRegulatoryNotifications(getRequest("/_api/regulatory-notification/list?limit=1"));

    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toEqual({ error: "Forbidden: Admin access required" });
    expect(mocks.db.selectFrom).not.toHaveBeenCalled();
  });
});
