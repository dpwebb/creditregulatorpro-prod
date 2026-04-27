import type { Selectable } from "kysely";
import type { ObligationInstance } from "./schema";
import type { DetectedViolation } from "./complianceDetectorTypes";

/**
 * Analyzes furnisher/creditor responses to disputes to identify generic, 
 * dismissive, or undocumented verifications that fail reasonable investigation standards.
 */
export function detectFurnisherResponseQuality(
  obligationInstances: Selectable<ObligationInstance>[]
): DetectedViolation[] {
  const violations: DetectedViolation[] = [];
  const dismissiveResponseIndicators = [
    "verified", 
    "accurate as reported", 
    "valid debt", 
    "no change"
  ];

  obligationInstances.forEach((instance) => {
    // Only evaluate if we actually received a response
    if (!instance.responseReceivedDate) return;

    const responseStatus = instance.responseStatus?.toLowerCase() ?? "";
    const isDismissive = dismissiveResponseIndicators.some(keyword => responseStatus.includes(keyword));
    const contentLength = instance.responseLetterContent?.length ?? 0;
    
    // Check 1: Dismissive language + no real explanation
    if (isDismissive && contentLength < 100) {
      violations.push({
        violationCategory: "FURNISHER_RESPONSE_QUALITY",
        severity: "WARNING",
        confidenceScore: 80,
        userExplanation: "The furnisher provided a generic 'verified' response without giving any real details about their investigation.",
        technicalDetails: {
          obligationInstanceId: instance.id,
          responseStatus: instance.responseStatus,
          contentLength: contentLength,
          detectedValue: instance.responseStatus,
          regulationIds: ["PIPEDA_4_10"],
        },
        recommendedAction: "Demand a detailed explanation of exactly how they verified the account, as a rubber-stamp response is not a real investigation.",
        tradelineId: instance.tradelineId ?? undefined,
        responsibleEntity: "CREDITOR",
      });
    }

    // Check 2: No documentation provided
    if (instance.responseDocumentationProvided === false) {
      violations.push({
        violationCategory: "FURNISHER_RESPONSE_QUALITY",
        severity: "WARNING",
        confidenceScore: 80,
        userExplanation: "The furnisher failed to provide any supporting documents to prove their claims.",
        technicalDetails: {
          obligationInstanceId: instance.id,
          documentationProvided: false,
          detectedValue: false,
          regulationIds: ["PIPEDA_4_10"],
        },
        recommendedAction: "Ask the furnisher for the actual paperwork (like signed contracts or statements) they used to verify this account.",
        tradelineId: instance.tradelineId ?? undefined,
        responsibleEntity: "CREDITOR",
      });
    }
  });

  return violations;
}