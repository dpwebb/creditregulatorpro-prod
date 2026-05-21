import { beforeEach, describe, expect, it, vi } from "vitest";

type Operation = {
  scope: "transaction" | "global";
  kind: "select" | "insert" | "update";
  table: string;
  values?: Record<string, unknown>;
  set?: Record<string, unknown>;
  where?: unknown[];
};

type HarnessState = {
  correction: Record<string, any>;
  updatedCorrection: Record<string, any> | null;
  evidence: Record<string, any>[];
  regulationReferences: Record<string, any>[];
  originalViolation: Record<string, any>;
  extractionRun: Record<string, any>;
  tradeline: Record<string, any>;
  existingTrainingExample: Record<string, any> | null;
  insertedTrainingExample: Record<string, any> | null;
  failTrainingInsert: boolean;
  failSuccessAudit: boolean;
};

const mocks = vi.hoisted(() => ({
  operations: [] as Operation[],
  state: null as HarnessState | null,
  db: {
    transaction: vi.fn(),
    selectFrom: vi.fn(),
    insertInto: vi.fn(),
    updateTable: vi.fn(),
  },
}));

vi.mock("../../helpers/db", () => ({
  db: mocks.db,
}));

import { finalizeCorrection } from "../../helpers/violationCorrectionManager";

function baseCorrection(overrides: Record<string, unknown> = {}) {
  return {
    id: 501,
    extractionRunId: 701,
    tradelineId: 801,
    originalViolationId: 901,
    correctionAction: "corrected",
    correctedViolationType: "CORRECTED_BALANCE_REVIEW",
    correctedSummary: "Synthetic corrected summary.",
    correctedExplanation: "Synthetic corrected explanation.",
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
    ...overrides,
  };
}

function makeState(overrides: Partial<HarnessState> = {}): HarnessState {
  return {
    correction: baseCorrection(),
    updatedCorrection: null,
    evidence: [
      {
        id: 2001,
        correctionId: 501,
        sourceDocumentId: 601,
        extractionRunId: 701,
        tradelineId: 801,
        pageNumber: 2,
        fieldName: "balance",
        textExcerpt: "Synthetic evidence excerpt.",
        normalizedValue: "200",
        evidenceReason: "Synthetic evidence reason.",
        adminSelected: true,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ],
    regulationReferences: [
      {
        id: 3001,
        violationId: 901,
        correctionId: 501,
        extractionRunId: 701,
        tradelineId: 801,
        jurisdiction: "provincial",
        country: "Canada",
        provinceOrTerritory: "ON",
        regulatorOrStandardBody: "Synthetic regulator",
        regulationName: "Synthetic reporting standard",
        statuteOrRuleName: "Synthetic rule",
        sectionNumber: "1",
        subsectionNumber: null,
        regulationTextExcerpt: "Synthetic reference excerpt.",
        citationUrl: null,
        citationSource: "admin_review",
        citationConfidence: 0.9,
        adminVerifiedCitation: true,
        adminNotes: null,
        mappingStatus: "active",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ],
    originalViolation: {
      id: 901,
      tradelineId: 801,
      violationCategory: "ORIGINAL_BALANCE_REVIEW",
    },
    extractionRun: {
      id: 701,
      reportArtifactId: 601,
      pass: "canonical",
      status: "completed",
      channelGuess: "pdf",
      channelConfidence: 1,
      completedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      rawEvidence: {},
      bureauContext: {},
      qualityNotes: null,
      userId: 10,
      reportDate: "2026-01-01",
      reportCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    tradeline: {
      id: 801,
      reportArtifactId: 601,
      creditorName: "Synthetic creditor",
      bureauName: "Synthetic bureau",
    },
    existingTrainingExample: null,
    insertedTrainingExample: null,
    failTrainingInsert: false,
    failSuccessAudit: false,
    ...overrides,
  };
}

function state() {
  if (!mocks.state) throw new Error("Harness state not installed");
  return mocks.state;
}

function selectedRow(table: string) {
  const current = state();
  switch (table) {
    case "violationCorrection":
      return current.updatedCorrection ?? current.correction;
    case "creditorObligationTest":
      return current.originalViolation;
    case "passExtraction":
      return current.extractionRun;
    case "tradeline":
      return current.tradeline;
    case "violationTrainingExample":
      return current.insertedTrainingExample ?? current.existingTrainingExample;
    default:
      return null;
  }
}

function selectedRows(table: string) {
  const current = state();
  switch (table) {
    case "violationCorrectionEvidence":
      return current.evidence;
    case "violationRegulationReference":
      return current.regulationReferences;
    default:
      return [];
  }
}

function builder(scope: Operation["scope"], table: string, kind: Operation["kind"]) {
  let pendingValues: Record<string, unknown> | undefined;
  let pendingSet: Record<string, unknown> | undefined;
  const chain: Record<string, any> = {};

  chain.select = vi.fn(() => chain);
  chain.selectAll = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.returningAll = vi.fn(() => chain);
  chain.where = vi.fn((...where: unknown[]) => {
    mocks.operations.push({ scope, kind, table, where });
    return chain;
  });
  chain.values = vi.fn((values: Record<string, unknown>) => {
    pendingValues = values;
    mocks.operations.push({ scope, kind, table, values });
    return chain;
  });
  chain.set = vi.fn((set: Record<string, unknown>) => {
    pendingSet = set;
    mocks.operations.push({ scope, kind, table, set });
    return chain;
  });
  chain.execute = vi.fn(async () => {
    if (kind === "update" && table === "violationCorrection" && pendingSet) {
      state().updatedCorrection = {
        ...state().correction,
        ...pendingSet,
      };
    }
    if (kind === "insert" && table === "auditLog" && scope === "transaction" && state().failSuccessAudit) {
      throw new Error("synthetic success audit failure");
    }
    return [];
  });
  chain.executeTakeFirst = vi.fn(async () => selectedRow(table));
  chain.executeTakeFirstOrThrow = vi.fn(async () => {
    if (kind === "insert" && table === "violationTrainingExample") {
      if (state().failTrainingInsert) {
        throw new Error("synthetic training insert failure");
      }
      state().insertedTrainingExample = {
        id: 8801,
        ...pendingValues,
        createdAt: pendingValues?.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: pendingValues?.updatedAt ?? new Date("2026-01-01T00:00:00.000Z"),
      };
      return state().insertedTrainingExample;
    }
    if (kind === "update" && table === "violationTrainingExample") {
      state().insertedTrainingExample = {
        ...(state().existingTrainingExample ?? { id: 8801, correctionId: 501 }),
        ...pendingSet,
      };
      return state().insertedTrainingExample;
    }
    const row = selectedRow(table);
    if (!row) throw new Error(`Missing synthetic row for ${table}`);
    return row;
  });
  chain.execute = vi.fn(async () => {
    if (kind === "update" && table === "violationCorrection" && pendingSet) {
      state().updatedCorrection = {
        ...state().correction,
        ...pendingSet,
      };
    }
    if (kind === "insert" && table === "auditLog" && scope === "transaction" && state().failSuccessAudit) {
      throw new Error("synthetic success audit failure");
    }
    return selectedRows(table);
  });

  return chain;
}

function installHarness(nextState: HarnessState) {
  mocks.state = nextState;
  const transactionDb = {
    selectFrom: vi.fn((table: string) => builder("transaction", table, "select")),
    insertInto: vi.fn((table: string) => builder("transaction", table, "insert")),
    updateTable: vi.fn((table: string) => builder("transaction", table, "update")),
  };

  mocks.db.transaction.mockReturnValue({
    execute: vi.fn(async (callback: (trx: typeof transactionDb) => unknown) => callback(transactionDb)),
  });
  mocks.db.selectFrom.mockImplementation((table: string) => builder("global", table, "select"));
  mocks.db.insertInto.mockImplementation((table: string) => builder("global", table, "insert"));
  mocks.db.updateTable.mockImplementation((table: string) => builder("global", table, "update"));
}

function operationsFor(table: string, scope?: Operation["scope"]) {
  return mocks.operations.filter((operation) =>
    operation.table === table && (!scope || operation.scope === scope)
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.operations.length = 0;
  installHarness(makeState());
});

describe("violation correction finalization transaction boundary", () => {
  it("writes correction status, training material, and success audit in one transaction", async () => {
    const result = await finalizeCorrection(501, 101, {
      audit: {
        ipAddress: "127.0.0.1",
        userAgent: "synthetic-finalization-test",
      },
    });

    expect(mocks.db.transaction).toHaveBeenCalledTimes(1);
    expect(result.correction).toMatchObject({
      id: 501,
      status: "finalized",
      trainingLabel: "misclassified",
      finalizedByAdminId: 101,
    });
    expect(result.trainingExample).toMatchObject({
      id: 8801,
      correctionId: 501,
      label: "misclassified",
      useForTraining: true,
    });

    expect(operationsFor("violationCorrection", "transaction")).toContainEqual(
      expect.objectContaining({
        kind: "update",
        set: expect.objectContaining({
          status: "finalized",
          trainingLabel: "misclassified",
          finalizedByAdminId: 101,
        }),
      }),
    );
    expect(operationsFor("violationTrainingExample", "transaction")).toContainEqual(
      expect.objectContaining({
        kind: "insert",
        values: expect.objectContaining({
          correctionId: 501,
          label: "misclassified",
          expectedOutputJson: expect.objectContaining({
            canonicalStatus: "finalized",
          }),
        }),
      }),
    );
    expect(operationsFor("auditLog", "transaction")).toContainEqual(
      expect.objectContaining({
        kind: "insert",
        values: expect.objectContaining({
          status: "SUCCESS",
          entityId: 801,
          details: {
            action: "violation_correction_finalized",
            correctionId: 501,
            trainingExampleId: 8801,
            finalizationStatus: "complete",
          },
          ipAddress: "127.0.0.1",
          userAgent: "synthetic-finalization-test",
        }),
      }),
    );
    expect(operationsFor("auditLog", "global")).toEqual([]);
  });

  it("records operator-visible failure audit when training write fails after status update", async () => {
    installHarness(makeState({ failTrainingInsert: true }));

    await expect(finalizeCorrection(501, 101)).rejects.toThrow("synthetic training insert failure");

    expect(operationsFor("violationCorrection", "transaction")).toContainEqual(
      expect.objectContaining({
        kind: "update",
        set: expect.objectContaining({ status: "finalized" }),
      }),
    );
    expect(operationsFor("auditLog", "transaction")).toEqual([]);
    expect(operationsFor("auditLog", "global")).toContainEqual(
      expect.objectContaining({
        kind: "insert",
        values: expect.objectContaining({
          status: "FAILURE",
          entityId: 801,
          details: expect.objectContaining({
            action: "violation_correction_finalization_failed",
            correctionId: 501,
            finalizationStatus: "failed",
            finalizedStatusApplied: false,
            rollbackExpected: true,
            error: "synthetic training insert failure",
          }),
        }),
      }),
    );
  });

  it("rolls back success state when success audit fails and retries idempotently", async () => {
    installHarness(makeState({ failSuccessAudit: true }));

    await expect(finalizeCorrection(501, 101)).rejects.toThrow("synthetic success audit failure");
    expect(operationsFor("auditLog", "global")).toContainEqual(
      expect.objectContaining({
        kind: "insert",
        values: expect.objectContaining({
          status: "FAILURE",
          details: expect.objectContaining({
            action: "violation_correction_finalization_failed",
            finalizedStatusApplied: false,
          }),
        }),
      }),
    );

    mocks.operations.length = 0;
    installHarness(makeState());

    const retried = await finalizeCorrection(501, 101);

    expect(retried.correction).toMatchObject({ id: 501, status: "finalized" });
    expect(retried.trainingExample).toMatchObject({ correctionId: 501 });
    expect(operationsFor("auditLog", "transaction")).toContainEqual(
      expect.objectContaining({
        values: expect.objectContaining({
          status: "SUCCESS",
          details: expect.objectContaining({
            action: "violation_correction_finalized",
            correctionId: 501,
          }),
        }),
      }),
    );
    expect(operationsFor("auditLog", "global")).toEqual([]);
  });
});
