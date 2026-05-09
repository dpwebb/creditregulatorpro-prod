import { differenceInDays, parseISO, isValid } from "./dateUtils";
import type { Selectable } from "kysely";
import type { Tradeline, ObligationInstance } from "./schema";
import type { DetectedViolation } from "./complianceDetectorTypes";
import { regulationRegistry } from "./regulationRegistry";

/**
 * Checks for creditor responses that are past the 30-day requirement.
 */
export function detectProceduralTimingViolation(
  obligationInstances: Selectable<ObligationInstance>[]
): DetectedViolation[] {
  const violations: DetectedViolation[] = [];
  const RESPONSE_DEADLINE_DAYS = 30;

  obligationInstances.forEach((instance) => {
    if (instance.challengeSentDate && instance.responseReceivedDate) {
      const sentDate = parseISO(instance.challengeSentDate.toString());
      const receivedDate = parseISO(instance.responseReceivedDate.toString());

      if (isValid(sentDate) && isValid(receivedDate)) {
        const daysToRespond = differenceInDays(receivedDate, sentDate);
        if (daysToRespond > RESPONSE_DEADLINE_DAYS) {
          violations.push({
            violationCategory: "PROCEDURAL_TIMING_VIOLATION",
            severity: "ERROR",
            confidenceScore: 100,
            userExplanation: `The company failed to provide a DISPUTE RESPONSE within the required 30 days.`,
            technicalDetails: {
              obligationInstanceId: instance.id,
              challengeSent: sentDate.toISOString(),
              responseReceived: receivedDate.toISOString(),
              daysTaken: daysToRespond,
              detectedValue: daysToRespond,
            },
            recommendedAction: "Ask for this item to be deleted because the company took too long to respond.",
            tradelineId: instance.tradelineId ?? undefined,
            responsibleEntity: "CREDITOR",
          });
        }
      }
    }
  });

  return violations;
}

/**
 * Verifies that the account status matches its financial data.
 */
export function detectAccountStatusInconsistency(
  tradeline: Selectable<Tradeline>
): DetectedViolation[] {
  const violations: DetectedViolation[] = [];
  const status = (tradeline.status || "").toUpperCase();
  const balance = Number(tradeline.balance || (tradeline as any).currentBalance || 0);
  const sourceText = String((tradeline as any).sourceText || "").toUpperCase();

  const isPaidStatus = status.includes("PAID") || status.includes("SETTLED");
  const hasClosedAtConsumerNarrative =
    /(?:^|[^A-Z0-9])CZ(?:[^A-Z0-9]|$)/.test(sourceText) ||
    sourceText.includes("CLOSED AT CONSUMER");

  if (isPaidStatus && balance > 0) {
    violations.push({
      violationCategory: "ACCOUNT_STATUS_INCONSISTENCY",
      severity: "ERROR",
      confidenceScore: 100,
      userExplanation: "The ACCOUNT STATUS does not match the reported BALANCE.",
      technicalDetails: {
        status: tradeline.status,
        balance: balance,
        detectedValue: tradeline.status,
        regulationIds: ["PIPEDA_4_6", "PIPEDA_4_6_1"],
      },
      recommendedAction: "Ask them to fix the account status or update the balance so they match.",
      tradelineId: tradeline.id,
      responsibleEntity: "CREDITOR",
    });
  }

  if (hasClosedAtConsumerNarrative && !tradeline.dateClosed && !status.includes("CLOSED")) {
    violations.push({
      violationCategory: "ACCOUNT_STATUS_INCONSISTENCY",
      severity: "ERROR",
      confidenceScore: 94,
      userExplanation: "The report narrative says this account was closed at the consumer's request, but the account status still shows it as open and no closed date was reported.",
      technicalDetails: {
        ruleName: "SOURCE_NARRATIVE_STATUS_MISMATCH",
        fieldName: "status",
        expectedValue: "Closed at consumer request with a closed date, or corrected open status",
        actualValue: tradeline.status || "OPEN",
        detectedValue: tradeline.status || "OPEN",
        narrativeCode: "CZ",
        dateClosed: tradeline.dateClosed,
        textSnippet: sourceText.includes("CZ-")
          ? "CZ-Closed at consumer's request"
          : "CZ / closed at consumer request",
        regulationIds: ["PIPEDA_4_6", "PIPEDA_4_6_1", "METRO2_BASE_SEGMENT"],
      },
      recommendedAction: "Ask the company to correct the account status or provide the source record showing why the account is still open.",
      tradelineId: tradeline.id,
      responsibleEntity: "CREDITOR",
    });
  }

  return violations;
}

/**
 * Analyzes creditor responses for completeness and flags generic or insufficient replies.
 */
export function detectCreditorResponseQuality(
  obligationInstances: Selectable<ObligationInstance>[]
): DetectedViolation[] {
  const violations: DetectedViolation[] = [];
  const dismissiveResponseIndicators = ["verified", "accurate as reported", "valid debt", "no change"];

  obligationInstances.forEach((instance) => {
    const response = instance.responseStatus?.toLowerCase() ?? "";
    if (response && dismissiveResponseIndicators.some(keyword => response.includes(keyword))) {
      // This is a low-confidence check, as "verified" can be a valid response.
      // A more advanced implementation would use NLP.
      violations.push({
        violationCategory: "CREDITOR_RESPONSE_QUALITY",
        severity: "WARNING",
        confidenceScore: 75,
        userExplanation: "The creditor provided an INSUFFICIENT RESPONSE to the dispute.",
        technicalDetails: {
          obligationInstanceId: instance.id,
          response: instance.responseStatus,
          detectedValue: instance.responseStatus,
          regulationIds: ["PIPEDA_4_10"],
        },
        recommendedAction: "Ask the company for real proof and specific documents to show this debt is accurate.",
        tradelineId: instance.tradelineId ?? undefined,
        responsibleEntity: "CREDITOR",
      });
    }
  });

  return violations;
}
