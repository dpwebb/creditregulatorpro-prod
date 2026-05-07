import { describe, expect, it } from "vitest";

import {
  buildDeterministicCreditReportPipelinePackage,
  type DeterministicPipelinePackage,
} from "../../helpers/deterministicCreditReportPipeline";
import {
  assertDeterministicReplay,
  validateDeterministicReplay,
} from "../../helpers/deterministicReplayValidator";
import type { ComprehensiveParseResult } from "../../helpers/reportParserTypes";

function parseResult(): ComprehensiveParseResult {
  return {
    rawText: "Credit Report\nReport Date 2026-01-10\nConsumer Information\nDOB 1961-01-30\n",
    sourceBureau: { bureauName: "TransUnion Canada", confidence: 100 },
    reportMetadata: {
      reportDate: new Date(Date.UTC(2026, 0, 10)),
      reportNumber: null,
      fileNumber: null,
      bureauFileId: null,
      transUnionCaseId: null,
      bureauName: "TransUnion Canada",
      bureauPhone: null,
      bureauAddress: null,
      totalAccounts: null,
      openAccounts: null,
      closedAccounts: null,
      delinquentAccounts: null,
      derogatoryAccounts: null,
      totalBalances: null,
      totalCreditLimit: null,
      utilizationPercent: null,
      fraudAlertActive: false,
      securityFreezeActive: false,
      activeDisputePresent: false,
      militaryLendingActCovered: false,
      oldestAccountDate: null,
      newestAccountDate: null,
      averageAccountAge: null,
      rawHeaderText: null,
      confidence: 100,
    },
    consumerInfo: {
      fullName: "TEST CONSUMER",
      addressLine1: "26 MAIN ST E",
      addressLine2: null,
      city: "STEWIACKE",
      province: "NS",
      postalCode: "B0N 2J0",
      dateOfBirth: new Date(Date.UTC(1961, 0, 30)),
      dateOfBirthRaw: "1961-01-30",
      phone: null,
      phoneSecondary: null,
      sinLastDigits: null,
      previousAddresses: [],
      confidence: 100,
    },
    tradelines: [],
    creditScores: [],
    inquiries: [],
    publicRecords: [],
    consumerStatements: [],
    employmentInfo: [],
    paymentHistories: [],
  };
}

describe("deterministic replay validator", () => {
  it("passes when a pipeline package replays from the same typed inputs", () => {
    const input = {
      parseResult: parseResult(),
      rawText: parseResult().rawText,
      documentBinarySha256: "document-sha",
      appliedParserRuleIds: [12, 3],
    };
    const expected = buildDeterministicCreditReportPipelinePackage(input);

    const validation = assertDeterministicReplay(input, expected);

    expect(validation.ok).toBe(true);
    expect(validation.differences).toEqual([]);
    expect(validation.replayHash).toBe(expected.replayHash);
    expect(validation.checkedKeys).toContain("candidatePools");
  });

  it("fails closed when a stored package no longer matches replayed deterministic output", () => {
    const input = {
      parseResult: parseResult(),
      rawText: parseResult().rawText,
      documentBinarySha256: "document-sha",
    };
    const expected = buildDeterministicCreditReportPipelinePackage(input);
    const mutated: DeterministicPipelinePackage = {
      ...expected,
      replayHash: "mutated-replay-hash",
    };

    const validation = validateDeterministicReplay(input, mutated);

    expect(validation.ok).toBe(false);
    expect(validation.differences).toContain("replayHash");
    expect(() => assertDeterministicReplay(input, mutated)).toThrow(
      /Deterministic replay validation failed/,
    );
  });
});
