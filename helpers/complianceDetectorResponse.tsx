import type { Selectable } from "kysely";
import { regulationRegistry } from "./regulationRegistry";
import type { ObligationInstance } from "./schema";
import type { DetectedViolation } from "./complianceDetectorTypes";

/**
 * Checks if Method of Verification (MOV) was disclosed in the response.
 * Legally, furnishers/bureaus must disclose how they verified the information if requested.
 */
export function detectResponseMovMissing(
  obligationInstances: Selectable<ObligationInstance>[]
): DetectedViolation[] {
  const violations: DetectedViolation[] = [];

  obligationInstances.forEach((instance) => {
    // Only check if a response was actually received
    if (!instance.responseReceivedDate) return;

    // If MOV was not disclosed (false or null)
    if (!instance.responseMovDisclosed) {
      violations.push({
        violationCategory: "RESPONSE_MOV_MISSING",
        severity: "ERROR",
        confidenceScore: 100,
        userExplanation: "The response is missing the METHOD OF VERIFICATION.",
        technicalDetails: {
          obligationInstanceId: instance.id,
          responseReceivedDate: instance.responseReceivedDate,
          movDisclosed: instance.responseMovDisclosed,
          detectedValue: instance.responseMovDisclosed,
          regulationIds: ["PIPEDA_4_9", "PIPEDA_4_10"],
        },
        recommendedAction:
          "Send a follow-up letter asking them exactly how they verified this information.",
        tradelineId: instance.tradelineId ?? undefined,
        responsibleEntity: "BUREAU",
      });
    }
  });

  return violations;
}

/**
 * Checks if all disputed items were addressed in the response.
 * Compares the list of items originally disputed vs. items addressed in the response.
 */
export function detectResponseIncomplete(
  obligationInstances: Selectable<ObligationInstance>[]
): DetectedViolation[] {
  const violations: DetectedViolation[] = [];

  obligationInstances.forEach((instance) => {
    if (!instance.responseReceivedDate) return;

    const disputed = (instance.responseItemsDisputed as string[]) || [];
    const addressed = (instance.responseItemsAddressed as string[]) || [];

    if (disputed.length === 0) return;

    // Find items that are in disputed but not in addressed
    // We do a case-insensitive check
    const unaddressedItems = disputed.filter((dItem) => {
      const dItemNorm = dItem.toLowerCase().trim();
      return !addressed.some(
        (aItem) => aItem.toLowerCase().trim() === dItemNorm
      );
    });

    if (unaddressedItems.length > 0) {
      const percentUnaddressed = unaddressedItems.length / disputed.length;
      const severity = percentUnaddressed > 0.5 ? "ERROR" : "WARNING";

      violations.push({
        violationCategory: "RESPONSE_INCOMPLETE",
        severity: severity,
        confidenceScore: 100,
        userExplanation: `The response ignored ${unaddressedItems.length} of ${disputed.length} DISPUTED ITEMS.`,
        technicalDetails: {
          obligationInstanceId: instance.id,
          totalDisputed: disputed.length,
          totalAddressed: addressed.length,
          unaddressedItems: unaddressedItems,
          detectedValue: unaddressedItems,
          regulationIds: ["PIPEDA_4_10"],
        },
        recommendedAction:
          "Tell them their investigation is incomplete and ask them to answer for the items they ignored.",
        tradelineId: instance.tradelineId ?? undefined,
        responsibleEntity: "BUREAU",
      });
    }
  });

  return violations;
}

/**
 * Checks if supporting documentation was provided with the response.
 * Mere statements without proof are often insufficient for verification.
 */
export function detectResponseNoDocumentation(
  obligationInstances: Selectable<ObligationInstance>[]
): DetectedViolation[] {
  const violations: DetectedViolation[] = [];

  obligationInstances.forEach((instance) => {
    if (!instance.responseReceivedDate) return;

    if (instance.responseDocumentationProvided === false) {
      violations.push({
        violationCategory: "RESPONSE_NO_DOCUMENTATION",
        severity: "WARNING",
        confidenceScore: 90,
        userExplanation: "The response is missing SUPPORTING DOCUMENTATION.",
        technicalDetails: {
          obligationInstanceId: instance.id,
          documentationProvided: false,
          detectedValue: false,
          regulationIds: ["PIPEDA_4_10"],
        },
        recommendedAction:
          "Demand that they send you the actual documents that prove you owe this money.",
        tradelineId: instance.tradelineId ?? undefined,
        responsibleEntity: "BUREAU",
      });
    }
  });

  return violations;
}

/**
 * Checks if the response came from the expected address.
 * Responses from unknown PO boxes or different processing centers can indicate
 * third-party handling or procedural irregularities.
 */
export function detectResponseAddressMismatch(
  obligationInstances: Selectable<ObligationInstance>[]
): DetectedViolation[] {
  const violations: DetectedViolation[] = [];

  obligationInstances.forEach((instance) => {
    if (!instance.responseReceivedDate) return;
    if (!instance.responseSenderAddress || !instance.responseExpectedAddress)
      return;

    const sender = normalizeAddress(instance.responseSenderAddress);
    const expected = normalizeAddress(instance.responseExpectedAddress);

    // Simple check: if normalized strings are significantly different
    // This is a basic fuzzy match simulation
    if (!areAddressesSimilar(sender, expected)) {
      violations.push({
        violationCategory: "RESPONSE_ADDRESS_MISMATCH",
        severity: "WARNING",
        confidenceScore: 75,
        userExplanation: "The response sender address does not match the EXPECTED ADDRESS.",
        technicalDetails: {
          obligationInstanceId: instance.id,
          actualSender: instance.responseSenderAddress,
          expectedAddress: instance.responseExpectedAddress,
          detectedValue: instance.responseSenderAddress,
          regulationIds: ["PIPEDA_4_10"],
        },
        recommendedAction:
          "Check if a different company might be handling this, or point out they are using the wrong address.",
        tradelineId: instance.tradelineId ?? undefined,
        responsibleEntity: "BUREAU",
      });
    }
  });

  return violations;
}

/**
 * Checks for proper authorization or signature on the response.
 * Automated computer-generated responses often lack a human signature,
 * which can be challenged as lack of reasonable investigation.
 */
export function detectResponseUnauthorized(
  obligationInstances: Selectable<ObligationInstance>[]
): DetectedViolation[] {
  const violations: DetectedViolation[] = [];

  obligationInstances.forEach((instance) => {
    if (!instance.responseReceivedDate) return;

    if (instance.responseAuthorizedSignature === false) {
      violations.push({
        violationCategory: "RESPONSE_UNAUTHORIZED",
        severity: "INFO",
        confidenceScore: 60,
        userExplanation: "The response is missing an AUTHORIZED SIGNATURE.",
        technicalDetails: {
          obligationInstanceId: instance.id,
          hasSignature: false,
          signatoryName: instance.responseSignatoryName,
          detectedValue: false,
          regulationIds: ["PIPEDA_4_10"],
        },
        recommendedAction:
          "Complain that a real person didn't actually look into your dispute.",
        tradelineId: instance.tradelineId ?? undefined,
        responsibleEntity: "BUREAU",
      });
    }
  });

  return violations;
}

/**
 * Aggregates all response audit detectors.
 */
export function runAllResponseAuditDetectors(
  obligationInstances: Selectable<ObligationInstance>[]
): DetectedViolation[] {
  const violations: DetectedViolation[] = [];

  violations.push(...detectResponseMovMissing(obligationInstances));
  violations.push(...detectResponseIncomplete(obligationInstances));
  violations.push(...detectResponseNoDocumentation(obligationInstances));
  violations.push(...detectResponseAddressMismatch(obligationInstances));
  violations.push(...detectResponseUnauthorized(obligationInstances));

  return violations;
}

// --- Helpers ---

function normalizeAddress(addr: string): string {
  return addr
    .toLowerCase()
    .replace(/[.,#-]/g, " ") // Remove punctuation
    .replace(/\s+/g, " ") // Collapse whitespace
    .replace(/\b(st|ave|rd|blvd|dr|ln|ct|pl|po box|p\.o\. box)\b/g, "") // Remove common suffixes/prefixes for comparison
    .trim();
}

function areAddressesSimilar(addr1: string, addr2: string): boolean {
  // If one contains the other, it's a match (e.g. "123 Main" in "123 Main St")
  if (addr1.includes(addr2) || addr2.includes(addr1)) return true;

  // If they share significant tokens (e.g. zip code + street number)
  // This is a very basic heuristic
  const tokens1 = new Set(addr1.split(" "));
  const tokens2 = new Set(addr2.split(" "));
  const intersection = new Set([...tokens1].filter((x) => tokens2.has(x)));

  // If they share at least 50% of tokens, consider it similar enough to pass
  const minTokens = Math.min(tokens1.size, tokens2.size);
  if (minTokens === 0) return false;

  return intersection.size / minTokens >= 0.5;
}