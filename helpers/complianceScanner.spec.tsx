import { scanForViolations, loadComplianceConfig } from "./complianceScanner";
declare const vi: any;
import type { DetectedViolation } from "./complianceDetectors";
import type { ViolationCategory } from "./schema";

// 1. Mock db
const executeMock = vi.fn();
const executeTakeFirstMock = vi.fn();

vi.mock("./db", () => ({
  db: {
    selectFrom: vi.fn(() => ({
      selectAll: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      execute: executeMock,
      executeTakeFirst: executeTakeFirstMock,
    })),
  },
}));

// 2. Mock all dependencies that could throw or do DB calls
vi.mock("./complianceDetectors", () => {
  return {
    detectTemporalManipulation: vi.fn(() => []),
    detectCrossEntityDiscrepancy: vi.fn(async () => []),
    detectStatuteOfLimitations: vi.fn(async () => []),
    detectPaymentHistoryManipulation: vi.fn(() => []),
    detectBalanceCalculationViolation: vi.fn(() => []),
    detectDocumentationChainFailure: vi.fn(async () => []),
    detectProceduralTimingViolation: vi.fn(() => []),
    detectMultipleCollectorViolation: vi.fn(async () => []),
    detectCreditLimitManipulation: vi.fn(() => []),
    detectBankruptcyDischargeViolation: vi.fn(() => []),
    detectIdentityTheftViolation: vi.fn(async () => []),
    detectAccountStatusInconsistency: vi.fn(() => []),
    detectCreditorResponseQuality: vi.fn(() => []),
    detectCrossBureauInconsistency: vi.fn(async () => []),
    detectDebtValidationFailure: vi.fn(async () => []),
    detectOriginalCreditorChainFailure: vi.fn(async () => []),
    detectMetro2FieldViolations: vi.fn(async () => []),
    detectMetro2RulesetViolations: vi.fn(async () => []),
    runAllResponseAuditDetectors: vi.fn(() => []),
    detectBureauInvestigationFailure: vi.fn(() => []),
    detectBureauNotificationFailure: vi.fn(() => []),
    detectBureauReinvestigationFailure: vi.fn(() => []),
    detectBureauAccessViolation: vi.fn(async () => []),
    detectBureauDisputeMarkingFailure: vi.fn(() => []),
    detectFurnisherReagingViolation: vi.fn(() => []),
    detectFurnisherStatusCodeMismatch: vi.fn(() => []),
    detectFurnisherJointAccountViolation: vi.fn(() => []),
    detectFurnisherAuthorizedUserMisrepresentation: vi.fn(() => []),
    detectFurnisherPostDisputeRetaliation: vi.fn(() => []),
    detectCollectorLicenseFailure: vi.fn(async () => []),
    detectCollectorUnauthorizedFees: vi.fn(async () => []),
    detectCollectorDuplicateReporting: vi.fn(async () => []),
    detectCollectorStatuteRevivalAttempt: vi.fn(async () => []),
    detectDuplicateCollectionAssignment: vi.fn(async () => []),
    detectDisclosureDeficiency: vi.fn(async () => []),
    detectPhantomDebtUnverifiable: vi.fn(async () => []),
    detectRetroactiveHistoryManipulation: vi.fn(() => []),
    detectDateLogicImpossibility: vi.fn(() => []),
    detectStaleReportingFailure: vi.fn(() => []),
    detectConsumerStatementSuppression: vi.fn(async () => []),
    detectInvestigationRubberStamp: vi.fn(() => []),
    detectClosedAccountBalanceInflation: vi.fn(() => []),
    detectZombieDebtResurrection: vi.fn(() => []),
    detectLastActivityDateManipulation: vi.fn(() => []),
    detectCollectionLimitationExceeded: vi.fn(async () => []),
    detectMixedFilePersonalInfoMismatch: vi.fn(async () => []),
    detectConsentWithdrawalNotHonored: vi.fn(async () => []),
    detectFreezeViolationInquiry: vi.fn(async () => []),
    deduplicateViolations: vi.fn(),
  };
});

vi.mock("./resolveTradelineProvince", () => ({
  resolveTradelineProvince: vi.fn(async () => "ON"),
}));

vi.mock("./dynamicRuleExecutor", () => ({
  executeActiveRules: vi.fn(async () => []),
}));

vi.mock("./violationCorrectionRetrieval", () => ({
  applyViolationCorrectionTruthLayer: vi.fn(async (violations) => violations),
}));

import { deduplicateViolations } from "./complianceDetectors";

describe("complianceScanner filtering logic", () => {
  const scanContext = {
    tradeline: { id: 1, userId: 123 } as any,
    reportArtifacts: [],
    bankruptcyRecords: [],
    obligationInstances: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. loadComplianceConfig() returns a Map with the right structure", async () => {
    executeMock.mockResolvedValueOnce([
      { violationCategory: "TEMPORAL_MANIPULATION", enabled: false, confidenceThreshold: 80, userExplanationTemplate: null, recommendedActionTemplate: null },
      { violationCategory: "BALANCE_CALCULATION_VIOLATION", enabled: true, confidenceThreshold: 60, userExplanationTemplate: null, recommendedActionTemplate: null },
    ]);

    const map = await loadComplianceConfig();
    
    expect(map).toBeInstanceOf(Map);
    expect(map.get("TEMPORAL_MANIPULATION")).toEqual({ enabled: false, confidenceThreshold: 80, userExplanationTemplate: null, recommendedActionTemplate: null });
    expect(map.get("BALANCE_CALCULATION_VIOLATION")).toEqual({ enabled: true, confidenceThreshold: 60, userExplanationTemplate: null, recommendedActionTemplate: null });
  });

  it("2. Violations with a disabled category are filtered out", async () => {
    executeMock.mockResolvedValueOnce([
      { violationCategory: "TEMPORAL_MANIPULATION", enabled: false, confidenceThreshold: 50 },
    ]);

    const mockViolations: DetectedViolation[] = [
      {
        violationCategory: "TEMPORAL_MANIPULATION" as ViolationCategory,
        severity: "ERROR",
        confidenceScore: 90,
        userExplanation: "Test",
        recommendedAction: "Test",
        technicalDetails: {},
      },
    ];

    vi.mocked(deduplicateViolations).mockReturnValueOnce(mockViolations);

    const result = await scanForViolations(1, scanContext);
    expect(result.length).toBe(0);
  });

  it("3. Violations below the confidence threshold are filtered out", async () => {
    executeMock.mockResolvedValueOnce([
      { violationCategory: "TEMPORAL_MANIPULATION", enabled: true, confidenceThreshold: 80 },
    ]);

    const mockViolations: DetectedViolation[] = [
      {
        violationCategory: "TEMPORAL_MANIPULATION" as ViolationCategory,
        severity: "ERROR",
        confidenceScore: 70, // Below threshold
        userExplanation: "Test",
        recommendedAction: "Test",
        technicalDetails: {},
      },
    ];

    vi.mocked(deduplicateViolations).mockReturnValueOnce(mockViolations);

    const result = await scanForViolations(1, scanContext);
    expect(result.length).toBe(0);
  });

  it("4. Categories with no config row default to enabled=true, threshold=50", async () => {
    executeMock.mockResolvedValueOnce([]); // No config found

    const mockViolations: DetectedViolation[] = [
      {
        violationCategory: "TEMPORAL_MANIPULATION" as ViolationCategory,
        severity: "ERROR",
        confidenceScore: 40, // Below default 50
        userExplanation: "Test1",
                recommendedAction: "Test1",
        technicalDetails: {},
      },
      {
        violationCategory: "BALANCE_CALCULATION_VIOLATION" as ViolationCategory,
        severity: "ERROR",
        confidenceScore: 60, // Above default 50
        userExplanation: "Test2",
        recommendedAction: "Test2",
        technicalDetails: {},
      },
    ];

    vi.mocked(deduplicateViolations).mockReturnValueOnce(mockViolations);

    const result = await scanForViolations(1, scanContext);
    expect(result.length).toBe(1);
    expect(result[0].violationCategory).toBe("BALANCE_CALCULATION_VIOLATION");
  });

  it("5. Violations above the threshold AND enabled pass through unchanged", async () => {
    executeMock.mockResolvedValueOnce([
      { violationCategory: "TEMPORAL_MANIPULATION", enabled: true, confidenceThreshold: 75 },
    ]);

    const mockViolations: DetectedViolation[] = [
      {
        violationCategory: "TEMPORAL_MANIPULATION" as ViolationCategory,
        severity: "ERROR",
        confidenceScore: 80,
                userExplanation: "Valid Violation",
        recommendedAction: "Action",
        technicalDetails: {},
      },
    ];

    vi.mocked(deduplicateViolations).mockReturnValueOnce(mockViolations);

    const result = await scanForViolations(1, scanContext);
    expect(result.length).toBe(1);
    expect(result[0].userExplanation).toContain("potential inconsistency");
  });

  it("6. Violations with no violationCategory pass through", async () => {
    executeMock.mockResolvedValueOnce([
      { violationCategory: "TEMPORAL_MANIPULATION", enabled: false, confidenceThreshold: 90 },
    ]);

    const mockViolations: DetectedViolation[] = [
      {
        // Missing violationCategory
        severity: "ERROR",
        confidenceScore: 10,
        userExplanation: "No Category",
        recommendedAction: "Action",
      } as any,
    ];

    vi.mocked(deduplicateViolations).mockReturnValueOnce(mockViolations);

    const result = await scanForViolations(1, scanContext);
    expect(result.length).toBe(1);
    expect(result[0].userExplanation).toContain("No Category");
  });
});
