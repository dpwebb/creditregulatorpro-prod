import type { Selectable } from "kysely";
import { regulationRegistry } from "./regulationRegistry";
import { db } from "./db";
import type { Tradeline } from "./schema";
import type { DetectedViolation } from "./complianceDetectorTypes";
import { isEffectivelyCollectionAccount } from "./complianceDetectorTypes";

/**
 * Detects if a collection account lacks a verifiable original creditor chain
 * or if the original creditor is missing entirely from the consumer's file.
 */
export async function detectPhantomDebtUnverifiable(
  tradeline: Selectable<Tradeline>
): Promise<DetectedViolation[]> {
  const violations: DetectedViolation[] = [];

  const isCollection = isEffectivelyCollectionAccount(tradeline);

  if (!isCollection || !tradeline.userId) {
    return violations;
  }

  let resolvedOriginalCreditorName = tradeline.originalCreditorName;
  let inferredFromCreditor = false;
  let currentCreditorName = "";

  if (tradeline.creditorId) {
    const creditor = await db
      .selectFrom("creditor")
      .select("name")
      .where("id", "=", tradeline.creditorId)
      .executeTakeFirst();
    
    if (creditor && creditor.name) {
      currentCreditorName = creditor.name;
    }
  }

  if (!resolvedOriginalCreditorName || resolvedOriginalCreditorName.trim() === "") {
    if (currentCreditorName) {
      resolvedOriginalCreditorName = currentCreditorName;
      inferredFromCreditor = true;
    }
  }

  if (!inferredFromCreditor && currentCreditorName && resolvedOriginalCreditorName) {
    const cName = currentCreditorName.toUpperCase();
    const ocName = resolvedOriginalCreditorName.toUpperCase();
    if (
      (cName.length > 3 && cName.includes(ocName)) ||
      (ocName.length > 3 && ocName.includes(cName))
    ) {
      return violations;
    }
  }

  // If there is no original creditor name at all, it's highly suspicious.
  if (!resolvedOriginalCreditorName || resolvedOriginalCreditorName.trim() === "") {
    violations.push({
      violationCategory: "PHANTOM_DEBT_UNVERIFIABLE",
      severity: "ERROR",
      confidenceScore: 95,
      userExplanation:
        "This COLLECTION ACCOUNT is missing the ORIGINAL CREDITOR name.",
      technicalDetails: {
        tradelineId: tradeline.id,
        originalCreditorName: null,
        detectedValue: null,
        regulationIds: ["PIPEDA_4_6"],
      },
      recommendedAction:
        "Demand that the collection agency provide full chain-of-title documentation proving they own this debt, or demand its immediate deletion.",
      responsibleEntity: "COLLECTOR",
    });
    return violations;
  }

  // If there is an original creditor name, check if we have a matching original tradeline
  const allTradelines = await db
    .selectFrom("tradeline")
        .select(["tradeline.id", "tradeline.creditorId", "tradeline.originalCreditorName"])
    .leftJoin("creditor", "creditor.id", "tradeline.creditorId")
    .select("creditor.name as creditorName")
    .where("tradeline.userId", "=", tradeline.userId)
    .execute();

  const originalNameUpper = resolvedOriginalCreditorName.toUpperCase();

  const matchingTradelines = allTradelines.filter((tl) => {
    // Skip the collection account itself unless we inferred the original creditor from it
    if (tl.id === tradeline.id && !inferredFromCreditor) return false; 

    const cName = (tl.creditorName || "").toUpperCase();
    const ocName = (tl.originalCreditorName || "").toUpperCase();

    return (
      (cName.length > 3 && cName.includes(originalNameUpper)) ||
      (originalNameUpper.length > 3 && originalNameUpper.includes(cName)) ||
      (ocName.length > 3 && ocName.includes(originalNameUpper)) ||
      (originalNameUpper.length > 3 && originalNameUpper.includes(ocName))
    );
  });

  if (matchingTradelines.length === 0) {
    const allCreditorNames = allTradelines
      .map((tl) => tl.creditorName || tl.originalCreditorName || "Unknown")
      .filter(Boolean);

    violations.push({
      violationCategory: "PHANTOM_DEBT_UNVERIFIABLE",
      severity: "WARNING",
      confidenceScore: 45,
      userExplanation:
        `The specified ORIGINAL CREDITOR "${resolvedOriginalCreditorName}" cannot be found on the credit file. This is common when the original account has aged off the credit file or was only reported by one bureau.`,
      technicalDetails: {
        tradelineId: tradeline.id,
        originalCreditorName: resolvedOriginalCreditorName,
        matchingTradelinesFound: 0,
        allCreditorNames,
        detectedValue: resolvedOriginalCreditorName,
        regulationIds: ["PIPEDA_4_6"],
      },
      recommendedAction:
        "Request that the collection agency verify the debt by providing documentation linking it to the original creditor.",
      responsibleEntity: "COLLECTOR",
    });
  }

  return violations;
}