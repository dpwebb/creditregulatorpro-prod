import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { NotAuthenticatedError } from "../../helpers/getSetServerSession";
import { correctionCanReplayIntoViolationTruth } from "../../helpers/violationCorrectionRetrieval";

type MutationOperation = {
  kind: "insert" | "update" | "delete" | "select";
  table: string;
  values?: unknown;
  set?: unknown;
  where?: unknown[];
};

const mocks = vi.hoisted(() => ({
  operations: [] as MutationOperation[],
  createdCorrection: {
    id: 501,
    extractionRunId: 701,
    tradelineId: 801,
    originalViolationId: 901,
    correctionAction: "corrected",
    correctedViolationType: "BALANCE_CALCULATION_VIOLATION",
    correctedSummary: "Synthetic balance field requires review.",
    correctedExplanation: "Synthetic explanation for endpoint coverage.",
    correctedSeverity: "WARNING",
    correctedConfidence: 88,
    correctionReason: "Synthetic correction reason.",
    adminNotes: "Synthetic admin note.",
    status: "in_review",
    trainingLabel: null,
    trainingNoteOnly: false,
    useForTraining: true,
    createdByAdminId: 101,
    finalizedByAdminId: null,
    finalReviewedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  } as any,
  db: {
    transaction: vi.fn(),
    insertInto: vi.fn(),
    updateTable: vi.fn(),
    deleteFrom: vi.fn(),
    selectFrom: vi.fn(),
  },
  getServerUserSession: vi.fn(),
  ensureViolationCorrectionSchema: vi.fn(),
  getCorrectionDetail: vi.fn(),
  getCorrectionEvidence: vi.fn(),
  getCorrectionRegulationReferences: vi.fn(),
  listFinalizedCorrectionPatterns: vi.fn(),
  summarizeRegulationReference: vi.fn(),
  normalizeCorrectionTextFields: vi.fn(),
  requireCorrection: vi.fn(),
  requireTradelineForRun: vi.fn(),
  requireViolationForTradeline: vi.fn(),
  upsertTrainingExampleForCorrection: vi.fn(),
  finalizeCorrection: vi.fn(),
}));

vi.mock("../../helpers/db", () => ({
  db: mocks.db,
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: mocks.getServerUserSession,
}));

vi.mock("../../helpers/violationCorrectionSchema", () => ({
  ensureViolationCorrectionSchema: mocks.ensureViolationCorrectionSchema,
}));

vi.mock("../../helpers/violationCorrectionManager", () => ({
  getCorrectionDetail: mocks.getCorrectionDetail,
  getCorrectionEvidence: mocks.getCorrectionEvidence,
  getCorrectionRegulationReferences: mocks.getCorrectionRegulationReferences,
  listFinalizedCorrectionPatterns: mocks.listFinalizedCorrectionPatterns,
  summarizeRegulationReference: mocks.summarizeRegulationReference,
  normalizeCorrectionTextFields: mocks.normalizeCorrectionTextFields,
  requireCorrection: mocks.requireCorrection,
  requireTradelineForRun: mocks.requireTradelineForRun,
  requireViolationForTradeline: mocks.requireViolationForTradeline,
  upsertTrainingExampleForCorrection: mocks.upsertTrainingExampleForCorrection,
  finalizeCorrection: mocks.finalizeCorrection,
}));

import { handle as createCorrection } from "../../endpoints/admin/violation-correction/create_POST";
import { handle as updateCorrection } from "../../endpoints/admin/violation-correction/update_POST";
import { handle as updateCorrectionEvidence } from "../../endpoints/admin/violation-correction/evidence_POST";
import { handle as finalizeCorrection } from "../../endpoints/admin/violation-correction/finalize_POST";

function mutationBuilder(table: string, kind: MutationOperation["kind"]) {
  const builder: Record<string, any> = {};
  builder.values = vi.fn((values: unknown) => {
    mocks.operations.push({ kind, table, values });
    return builder;
  });
  builder.set = vi.fn((set: unknown) => {
    mocks.operations.push({ kind, table, set });
    return builder;
  });
  builder.where = vi.fn((...where: unknown[]) => {
    mocks.operations.push({ kind, table, where });
    return builder;
  });
  builder.returningAll = vi.fn(() => builder);
  builder.select = vi.fn(() => builder);
  builder.selectAll = vi.fn(() => builder);
  builder.leftJoin = vi.fn(() => builder);
  builder.innerJoin = vi.fn(() => builder);
  builder.orderBy = vi.fn(() => builder);
  builder.limit = vi.fn(() => builder);
  builder.execute = vi.fn(async () => []);
  builder.executeTakeFirst = vi.fn(async () => null);
  builder.executeTakeFirstOrThrow = vi.fn(async () => mocks.createdCorrection);
  return builder;
}

function installDbHarness() {
  const trx = {
    insertInto: vi.fn((table: string) => mutationBuilder(table, "insert")),
    updateTable: vi.fn((table: string) => mutationBuilder(table, "update")),
    deleteFrom: vi.fn((table: string) => mutationBuilder(table, "delete")),
    selectFrom: vi.fn((table: string) => mutationBuilder(table, "select")),
  };

  mocks.db.transaction.mockReturnValue({
    execute: vi.fn(async (callback: (trx: typeof trx) => unknown) => callback(trx)),
  });
  mocks.db.insertInto.mockImplementation((table: string) => mutationBuilder(table, "insert"));
  mocks.db.updateTable.mockImplementation((table: string) => mutationBuilder(table, "update"));
  mocks.db.deleteFrom.mockImplementation((table: string) => mutationBuilder(table, "delete"));
  mocks.db.selectFrom.mockImplementation((table: string) => mutationBuilder(table, "select"));
}

function correctionRow(overrides: Record<string, unknown> = {}) {
  return {
    ...mocks.createdCorrection,
    ...overrides,
  };
}

function correctionDetail(overrides: Record<string, unknown> = {}) {
  return {
    ...correctionRow(),
    evidence: [],
    regulationReferences: [],
    trainingExample: null,
    ...overrides,
  };
}

function trainingExample(overrides: Record<string, unknown> = {}) {
  return {
    id: 8801,
    correctionId: 501,
    inputContextJson: { synthetic: true },
    expectedOutputJson: { canonicalStatus: "finalized" },
    regulationMappingJson: [],
    label: "confirmed_good",
    useForTraining: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function evidencePayload(overrides: Record<string, unknown> = {}) {
  return {
    sourceDocumentId: 1001,
    extractionRunId: 701,
    tradelineId: 801,
    pageNumber: 2,
    fieldName: "balance",
    textExcerpt: "Synthetic report line: balance field differs from expected value.",
    normalizedValue: "200",
    evidenceReason: "Synthetic evidence selected by admin for endpoint coverage.",
    adminSelected: true,
    ...overrides,
  };
}

function createPayload(overrides: Record<string, unknown> = {}) {
  return {
    extractionRunId: 701,
    tradelineId: 801,
    originalViolationId: 901,
    correctionAction: "corrected",
    correctedViolationType: "BALANCE_CALCULATION_VIOLATION",
    correctedSummary: "Synthetic balance field requires review.",
    correctedExplanation: "Synthetic explanation for endpoint coverage.",
    correctedSeverity: "WARNING",
    correctedConfidence: 88,
    correctionReason: "Synthetic correction reason.",
    adminNotes: "Synthetic admin note.",
    status: "in_review",
    trainingNoteOnly: false,
    useForTraining: true,
    ...overrides,
  };
}

function postRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "synthetic-admin-correction-test",
      "x-forwarded-for": "127.0.0.1",
    },
    body: JSON.stringify(body),
  });
}

function valuesFor(table: string) {
  return mocks.operations
    .filter((operation) => operation.table === table && Object.prototype.hasOwnProperty.call(operation, "values"))
    .map((operation) => operation.values);
}

function setFor(table: string) {
  return mocks.operations
    .filter((operation) => operation.table === table && Object.prototype.hasOwnProperty.call(operation, "set"))
    .map((operation) => operation.set);
}

function expectAuditSafe(value: unknown) {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toMatch(/\b\d{3}-\d{3}-\d{3}\b/);
  expect(serialized).not.toMatch(/\b\d{9}\b/);
  expect(serialized).not.toMatch(/fullSin|socialInsurance|rawConsumer|rawExtractedText|full account|unmasked account/i);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.operations.length = 0;
  installDbHarness();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);

  mocks.getServerUserSession.mockResolvedValue({
    user: { id: 101, role: "admin" },
  });
  mocks.ensureViolationCorrectionSchema.mockResolvedValue(undefined);
  mocks.requireTradelineForRun.mockResolvedValue({
    run: { id: 701, reportArtifactId: 601 },
    tradeline: { id: 801, reportArtifactId: 601 },
  });
  mocks.requireViolationForTradeline.mockResolvedValue({
    id: 901,
    tradelineId: 801,
    violationCategory: "BALANCE_CALCULATION_VIOLATION",
  });
  mocks.requireCorrection.mockResolvedValue(correctionRow());
  mocks.getCorrectionDetail.mockResolvedValue(correctionDetail());
  mocks.normalizeCorrectionTextFields.mockImplementation((input: Record<string, unknown>) => ({
    correctedSummary: input.correctedSummary ?? null,
    correctedExplanation: input.correctedExplanation ?? null,
    correctionReason: input.correctionReason ?? null,
    adminNotes: input.adminNotes ?? null,
  }));
  mocks.upsertTrainingExampleForCorrection.mockResolvedValue(trainingExample());
  mocks.finalizeCorrection.mockResolvedValue({
    correction: correctionDetail({ status: "finalized", finalReviewedAt: new Date("2026-01-02T00:00:00.000Z") }),
    trainingExample: trainingExample(),
  });
  mocks.getCorrectionEvidence.mockResolvedValue([]);
  mocks.getCorrectionRegulationReferences.mockResolvedValue([]);
  mocks.listFinalizedCorrectionPatterns.mockResolvedValue([]);
  mocks.summarizeRegulationReference.mockReturnValue("Synthetic regulation reference");
});

describe("admin violation correction endpoint truth-loop coverage", () => {
  it("lets admins create a synthetic correction with scoped evidence and audit logging", async () => {
    mocks.getCorrectionDetail.mockResolvedValueOnce(
      correctionDetail({
        evidence: [evidencePayload({ id: 2001 })],
      }),
    );

    const response = await createCorrection(
      postRequest("/_api/admin/violation-correction/create", {
        ...createPayload(),
        evidence: [evidencePayload()],
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      correction: expect.objectContaining({
        id: 501,
        extractionRunId: 701,
        tradelineId: 801,
        originalViolationId: 901,
      }),
    });

    expect(mocks.ensureViolationCorrectionSchema).toHaveBeenCalledTimes(1);
    expect(mocks.requireTradelineForRun).toHaveBeenCalledWith(801, 701);
    expect(mocks.requireViolationForTradeline).toHaveBeenCalledWith(901, 801);

    expect(valuesFor("violationCorrection")[0]).toMatchObject({
      extractionRunId: 701,
      tradelineId: 801,
      originalViolationId: 901,
      correctionAction: "corrected",
      correctedViolationType: "BALANCE_CALCULATION_VIOLATION",
      status: "in_review",
      trainingNoteOnly: false,
      useForTraining: true,
      createdByAdminId: 101,
    });
    expect(valuesFor("violationCorrectionEvidence")[0]).toEqual([
      expect.objectContaining({
        correctionId: 501,
        sourceDocumentId: 1001,
        extractionRunId: 701,
        tradelineId: 801,
        textExcerpt: "Synthetic report line: balance field differs from expected value.",
      }),
    ]);

    const audit = valuesFor("auditLog")[0] as Record<string, unknown>;
    expect(audit).toMatchObject({
      actionType: "CREATE",
      entityType: "TRADELINE",
      entityId: 801,
      userId: 101,
      details: {
        action: "violation_correction_created",
        correctionId: 501,
        extractionRunId: 701,
        originalViolationId: 901,
      },
      status: "SUCCESS",
    });
    expectAuditSafe(audit.details);
  });

  it("validates create requests before correction state is written", async () => {
    const response = await createCorrection(
      postRequest("/_api/admin/violation-correction/create", {
        extractionRunId: 701,
        tradelineId: 801,
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.requireTradelineForRun).not.toHaveBeenCalled();
    expect(mocks.db.transaction).not.toHaveBeenCalled();
    expect(valuesFor("violationCorrection")).toEqual([]);
  });

  it("adds same-run evidence and rejects mismatched evidence without writes", async () => {
    const success = await updateCorrectionEvidence(
      postRequest("/_api/admin/violation-correction/evidence", {
        action: "add",
        correctionId: 501,
        evidence: evidencePayload(),
      }),
    );

    expect(success.status).toBe(200);
    expect(mocks.requireCorrection).toHaveBeenCalledWith(501);
    expect(mocks.requireTradelineForRun).toHaveBeenCalledWith(801, 701);
    expect(valuesFor("violationCorrectionEvidence")[0]).toMatchObject({
      correctionId: 501,
      extractionRunId: 701,
      tradelineId: 801,
      textExcerpt: "Synthetic report line: balance field differs from expected value.",
    });
    expect(setFor("violationCorrection")[0]).toEqual(
      expect.objectContaining({ status: "in_review" }),
    );
    expect(valuesFor("auditLog")[0]).toMatchObject({
      details: {
        action: "violation_correction_evidence_added",
        correctionId: 501,
      },
    });

    vi.clearAllMocks();
    mocks.operations.length = 0;
    installDbHarness();
    mocks.getServerUserSession.mockResolvedValue({ user: { id: 101, role: "admin" } });
    mocks.ensureViolationCorrectionSchema.mockResolvedValue(undefined);
    mocks.requireCorrection.mockResolvedValue(correctionRow());
    mocks.requireTradelineForRun.mockResolvedValue({
      run: { id: 702, reportArtifactId: 602 },
      tradeline: { id: 802, reportArtifactId: 602 },
    });

    const mismatch = await updateCorrectionEvidence(
      postRequest("/_api/admin/violation-correction/evidence", {
        action: "add",
        correctionId: 501,
        evidence: evidencePayload({ extractionRunId: 702, tradelineId: 802 }),
      }),
    );

    expect(mismatch.status).toBe(400);
    await expect(mismatch.json()).resolves.toEqual({
      error: "Evidence must match the correction extraction run and tradeline",
    });
    expect(valuesFor("violationCorrectionEvidence")).toEqual([]);
    expect(valuesFor("auditLog")).toEqual([]);
    expect(setFor("violationCorrection")).toEqual([]);
  });

  it("keeps training-note and manual-only corrections out of replay candidate truth", () => {
    expect(correctionCanReplayIntoViolationTruth({ trainingNoteOnly: true })).toBe(false);
    expect(correctionCanReplayIntoViolationTruth({ originalViolationId: null, trainingNoteOnly: true })).toBe(false);
    expect(correctionCanReplayIntoViolationTruth({ trainingNoteOnly: false })).toBe(true);

    const managerSource = readFileSync(
      join(process.cwd(), "helpers", "violationCorrectionManager.tsx"),
      "utf8",
    );
    expect(managerSource).toContain('.where("violationCorrection.status", "=", "finalized")');
    expect(managerSource).toContain('.where("violationCorrection.trainingNoteOnly", "=", false)');
  });

  it("blocks direct update_POST finalization and does not create replay training output", async () => {
    mocks.requireCorrection.mockResolvedValueOnce(correctionRow({ status: "in_review" }));

    const response = await updateCorrection(
      postRequest("/_api/admin/violation-correction/update", {
        id: 501,
        status: "finalized",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Use the final review endpoint to finalize a violation correction.",
    });
    expect(mocks.requireCorrection).toHaveBeenCalledWith(501);
    expect(mocks.db.transaction).not.toHaveBeenCalled();
    expect(mocks.upsertTrainingExampleForCorrection).not.toHaveBeenCalled();
  });

  it("preserves rejected and manual-only correction history without activating replay truth", async () => {
    mocks.requireCorrection.mockResolvedValueOnce(correctionRow({ status: "draft", trainingNoteOnly: false }));
    mocks.getCorrectionDetail.mockResolvedValue(
      correctionDetail({
        correctionAction: "rejected",
        status: "in_review",
        trainingNoteOnly: true,
        useForTraining: false,
      }),
    );

    const response = await updateCorrection(
      postRequest("/_api/admin/violation-correction/update", {
        id: 501,
        correctionAction: "rejected",
        status: "in_review",
        trainingNoteOnly: true,
        useForTraining: false,
        adminNotes: "Synthetic manual-only note.",
      }),
    );

    expect(response.status).toBe(200);
    expect(setFor("violationCorrection")[0]).toEqual(
      expect.objectContaining({
        correctionAction: "rejected",
        status: "in_review",
        trainingNoteOnly: true,
        useForTraining: false,
      }),
    );
    expect(valuesFor("auditLog")[0]).toMatchObject({
      actionType: "UPDATE",
      details: {
        action: "violation_correction_updated",
        correctionId: 501,
        extractionRunId: 701,
        originalViolationId: 901,
      },
    });
    expectAuditSafe((valuesFor("auditLog")[0] as Record<string, unknown>).details);
    expect(mocks.upsertTrainingExampleForCorrection).not.toHaveBeenCalled();
  });

  it("finalizes only through the approved finalize endpoint and passes bounded audit context", async () => {
    const response = await finalizeCorrection(
      postRequest("/_api/admin/violation-correction/finalize", {
        correctionId: 501,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      correction: expect.objectContaining({ id: 501, status: "finalized" }),
      trainingExample: expect.objectContaining({ id: 8801, correctionId: 501 }),
    });
    expect(mocks.finalizeCorrection).toHaveBeenCalledWith(
      501,
      101,
      {
        audit: {
          ipAddress: "127.0.0.1",
          userAgent: "synthetic-admin-correction-test",
        },
      },
    );
    expect(valuesFor("auditLog")).toEqual([]);
  });

  it("surfaces finalize validation failures without writing audit state", async () => {
    mocks.finalizeCorrection.mockRejectedValueOnce(
      new BusinessRuleError("At least one evidence link is required before final review.", 400),
    );

    const response = await finalizeCorrection(
      postRequest("/_api/admin/violation-correction/finalize", {
        correctionId: 501,
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "At least one evidence link is required before final review.",
    });
    expect(valuesFor("auditLog")).toEqual([]);
  });

  it("denies non-admin correction create, update, evidence, and finalize before service work", async () => {
    mocks.getServerUserSession.mockResolvedValue({ user: { id: 202, role: "user" } });

    const responses = await Promise.all([
      createCorrection(postRequest("/_api/admin/violation-correction/create", createPayload())),
      updateCorrection(postRequest("/_api/admin/violation-correction/update", { id: 501 })),
      updateCorrectionEvidence(
        postRequest("/_api/admin/violation-correction/evidence", {
          action: "add",
          correctionId: 501,
          evidence: evidencePayload(),
        }),
      ),
      finalizeCorrection(postRequest("/_api/admin/violation-correction/finalize", { correctionId: 501 })),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    }
    expect(mocks.ensureViolationCorrectionSchema).not.toHaveBeenCalled();
    expect(mocks.db.transaction).not.toHaveBeenCalled();
    expect(mocks.finalizeCorrection).not.toHaveBeenCalled();
    expect(valuesFor("auditLog")).toEqual([]);
  });

  it("denies unauthenticated correction requests", async () => {
    mocks.getServerUserSession.mockRejectedValueOnce(new NotAuthenticatedError());

    const response = await createCorrection(
      postRequest("/_api/admin/violation-correction/create", createPayload()),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Not authenticated" });
    expect(mocks.ensureViolationCorrectionSchema).not.toHaveBeenCalled();
    expect(mocks.db.transaction).not.toHaveBeenCalled();
  });

  it("keeps admin correction endpoints outside parser, OCR, packet, and runtime-registry paths", () => {
    const endpointSources = [
      "create_POST.ts",
      "update_POST.ts",
      "evidence_POST.ts",
      "finalize_POST.ts",
      "regulation-reference_POST.ts",
    ].map((file) =>
      readFileSync(join(process.cwd(), "endpoints", "admin", "violation-correction", file), "utf8"),
    );
    const combined = endpointSources.join("\n");

    expect(combined).not.toMatch(
      /from\s+["'][^"']*(parser|canonical|ocr|packet|disputePacket|runtime-bridge|regulationRuntime|furnisher|adminOverride)/i,
    );
    expect(combined).not.toMatch(
      /validateDisputePacketReadiness|buildSimpleDisputePacketContent|packetReady|active_limited_runtime|selectRuntimeReference|activate.*registry|direct\s+furnisher/i,
    );
  });
});
