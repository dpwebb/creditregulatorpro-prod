import { afterEach, describe, expect, it, vi } from "vitest";

import type { DetectedViolation } from "../../helpers/complianceDetectorTypes";
import {
  correctionCanReplayIntoViolationTruth,
  getDeterministicAdminCorrectionMatch,
  type AdminCorrectionPatternForMatch,
  type TradelineForAdminCorrectionMatch,
} from "../../helpers/violationCorrectionRetrieval";

function correction(
  overrides: Partial<AdminCorrectionPatternForMatch> = {},
): AdminCorrectionPatternForMatch {
  return {
    id: 10,
    tradelineId: 100,
    correctionAction: "corrected",
    correctedViolationType: "BALANCE_CALCULATION_VIOLATION",
    correctedSummary: null,
    originalViolationCategory: null,
    patternCreditorId: 7,
    patternBureauId: 3,
    patternAccountNumber: "ABC-1234",
    ...overrides,
  };
}

function tradeline(overrides: Partial<TradelineForAdminCorrectionMatch> = {}) {
  return {
    id: 200,
    creditorId: 7,
    bureauId: 3,
    accountNumber: "ABC1234",
    ...overrides,
  };
}

function violation(overrides: Partial<DetectedViolation> = {}): DetectedViolation {
  return {
    violationCategory: "BALANCE_CALCULATION_VIOLATION",
    severity: "WARNING",
    confidenceScore: 85,
    userExplanation: "Balance requires review.",
    technicalDetails: {
      fieldName: "balance",
    },
    recommendedAction: "Review the account balance.",
    tradelineId: 200,
    ...overrides,
  };
}

describe("deterministic admin correction truth matching", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../../helpers/getServerUserSession");
    vi.doUnmock("../../helpers/violationCorrectionManager");
    vi.doUnmock("../../helpers/violationCorrectionSchema");
    vi.doUnmock("../../helpers/db");
  });

  it("applies a finalized correction to the same tradeline only when the category is exact", () => {
    const match = getDeterministicAdminCorrectionMatch(
      correction({ tradelineId: 200, correctedViolationType: null, originalViolationCategory: "BALANCE_CALCULATION_VIOLATION" }),
      [],
      violation(),
      tradeline(),
    );

    expect(match).toEqual({
      applies: true,
      kind: "same_tradeline_exact_category",
      reason: "same_tradeline_and_exact_violation_category",
    });
  });

  it("does not treat summary text as an authoritative category mapping", () => {
    const match = getDeterministicAdminCorrectionMatch(
      correction({
        tradelineId: 200,
        correctedViolationType: "DOCUMENTATION_CHAIN_FAILURE",
        originalViolationCategory: null,
        correctedSummary: "Admin mentioned BALANCE_CALCULATION_VIOLATION in notes.",
      }),
      [{ fieldName: "balance" }],
      violation(),
      tradeline(),
    );

    expect(match.applies).toBe(false);
    expect(match.reason).toBe("category_mismatch");
  });

  it("applies across reports only with exact account identity and exact evidence field", () => {
    const match = getDeterministicAdminCorrectionMatch(
      correction(),
      [{ fieldName: "balance" }],
      violation({
        technicalDetails: {
          deterministicRule: {
            sourceFields: ["balance"],
          },
        },
      }),
      tradeline(),
    );

    expect(match).toEqual({
      applies: true,
      kind: "same_account_exact_field",
      reason: "same_creditor_account_bureau_and_exact_evidence_field",
    });
  });

  it("rejects broad same-creditor or same-bureau matches without exact account and field evidence", () => {
    const match = getDeterministicAdminCorrectionMatch(
      correction({ patternAccountNumber: "DIFFERENT-9999" }),
      [{ fieldName: "balance" }],
      violation(),
      tradeline(),
    );

    expect(match.applies).toBe(false);
    expect(match.reason).toBe("no_exact_admin_truth_scope");
  });

  it("excludes training-note and manual-only notes from replay into violation truth", () => {
    expect(correctionCanReplayIntoViolationTruth({ trainingNoteOnly: true })).toBe(false);
    expect(
      correctionCanReplayIntoViolationTruth({
        originalViolationId: null,
        trainingNoteOnly: true,
      }),
    ).toBe(false);
    expect(correctionCanReplayIntoViolationTruth({ trainingNoteOnly: false })).toBe(true);
  });

  it("requires the finalize endpoint before an update can create finalized training output", async () => {
    const requireCorrection = vi.fn(async () => ({
      id: 10,
      status: "in_review",
      originalViolationId: 20,
      tradelineId: 100,
      correctionAction: "corrected",
      correctedViolationType: "BALANCE_CALCULATION_VIOLATION",
      trainingLabel: null,
      trainingNoteOnly: false,
      useForTraining: true,
    }));
    const upsertTrainingExampleForCorrection = vi.fn();

    vi.doMock("../../helpers/getServerUserSession", () => ({
      getServerUserSession: vi.fn(async () => ({ user: { id: 99, role: "admin" } })),
    }));
    vi.doMock("../../helpers/violationCorrectionSchema", () => ({
      ensureViolationCorrectionSchema: vi.fn(async () => undefined),
    }));
    vi.doMock("../../helpers/violationCorrectionManager", () => ({
      getCorrectionDetail: vi.fn(),
      normalizeCorrectionTextFields: vi.fn((input) => input),
      requireCorrection,
      requireViolationForTradeline: vi.fn(),
      upsertTrainingExampleForCorrection,
    }));
    vi.doMock("../../helpers/db", () => ({
      db: {
        transaction: vi.fn(),
      },
    }));

    const { handle } = await import("../../endpoints/admin/violation-correction/update_POST");
    const response = await handle(
      new Request("http://localhost/_api/admin/violation-correction/update", {
        method: "POST",
        body: JSON.stringify({ id: 10, status: "finalized" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Use the final review endpoint to finalize a violation correction.",
    });
    expect(requireCorrection).toHaveBeenCalledWith(10);
    expect(upsertTrainingExampleForCorrection).not.toHaveBeenCalled();
  });
});
