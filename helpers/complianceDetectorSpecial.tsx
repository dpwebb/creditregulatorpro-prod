import { parseISO, isValid, isAfter } from "./dateUtils";
import { regulationRegistry } from "./regulationRegistry";
import type { Selectable } from "kysely";
import { db } from "./db";
import type { Tradeline, BankruptcyRecord } from "./schema";
import type { DetectedViolation } from "./complianceDetectorTypes";

/**
 * Checks if required evidence/artifacts exist for the account.
 */
export async function detectDocumentationChainFailure(
  tradeline: Selectable<Tradeline>
): Promise<DetectedViolation[]> {
  const violations: DetectedViolation[] = [];

  if (!tradeline.reportArtifactId) {
    violations.push({
      violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
      severity: "ERROR",
      confidenceScore: 100,
      userExplanation: "This account is missing a linked ORIGINAL CREDIT REPORT.",
      technicalDetails: { tradelineId: tradeline.id, reportArtifactId: null, detectedValue: null, regulationIds: ["PIPEDA_4_6", "METRO2_BASE_SEGMENT"] },
      recommendedAction: "Make sure to upload or link the original credit report for this account.",
      tradelineId: tradeline.id,
      responsibleEntity: "CREDITOR",
    });
  } else {
    const artifact = await db
      .selectFrom("reportArtifact")
      .select("data")
      .where("id", "=", tradeline.reportArtifactId)
      .executeTakeFirst();
    
    if (artifact && (!artifact.data || Object.keys(artifact.data).length === 0)) {
      violations.push({
        violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
        severity: "WARNING",
        confidenceScore: 90,
        userExplanation: "The linked credit report is missing EXTRACTION DATA.",
        technicalDetails: { tradelineId: tradeline.id, reportArtifactId: tradeline.reportArtifactId, detectedValue: artifact.data, regulationIds: ["PIPEDA_4_6", "METRO2_BASE_SEGMENT"] },
        recommendedAction: "Check that the credit report document was read correctly by the system.",
        tradelineId: tradeline.id,
        responsibleEntity: "CREDITOR",
      });
    }
  }

  return violations;
}

/**
 * Checks if debts discharged in bankruptcy are still reported as collectible.
 */
export function detectBankruptcyDischargeViolation(
  tradeline: Selectable<Tradeline>,
  bankruptcies: Selectable<BankruptcyRecord>[]
): DetectedViolation[] {
  const violations: DetectedViolation[] = [];
  const dischargedBankruptcies = bankruptcies.filter(
    (b) => b.status === "DISCHARGED" && b.dischargeDate
  );

  for (const bankruptcy of dischargedBankruptcies) {
    const tradelineOpenedDate = tradeline.openedDate ? parseISO(tradeline.openedDate.toString()) : null;
    const bankruptcyDischargeDate = parseISO(bankruptcy.dischargeDate!.toString());

    if (tradelineOpenedDate && isValid(tradelineOpenedDate) && isAfter(bankruptcyDischargeDate, tradelineOpenedDate)) {
      const hasBalance = Number(tradeline.balance) > 0;
      const isNotIncluded = tradeline.accountDesignation?.toUpperCase().includes("BANKRUPTCY");

      if (hasBalance && isNotIncluded) {
        violations.push({
          violationCategory: "BANKRUPTCY_DISCHARGE_VIOLATION",
          severity: "ERROR",
          confidenceScore: 98,
          userExplanation: "This debt was DISCHARGED IN BANKRUPTCY but is still reported with a balance.",
          technicalDetails: {
            tradelineOpened: tradelineOpenedDate.toISOString(),
            bankruptcyDischargeDate: bankruptcyDischargeDate.toISOString(),
            balance: Number(tradeline.balance),
            bankruptcyRecordId: bankruptcy.id,
            detectedValue: Number(tradeline.balance),
            regulationIds: ["BIA_S178_2", "BIA_S168_1"],
          },
          recommendedAction: "Dispute this account and ask them to show it as included in bankruptcy with a zero balance.",
          tradelineId: tradeline.id,
          responsibleEntity: "CREDITOR",
        });
      }
    }
  }
  return violations;
}

/**
 * Flags suspicious account opening patterns consistent with identity theft.
 */
export async function detectIdentityTheftViolation(
  tradeline: Selectable<Tradeline>
): Promise<DetectedViolation[]> {
  const violations: DetectedViolation[] = [];
  if (!tradeline.userId) return violations;

  const allTradelines = await db
    .selectFrom("tradeline")
    .leftJoin("creditor", "creditor.id", "tradeline.creditorId")
    .select([
      "tradeline.id", 
      "tradeline.openedDate", 
      "tradeline.isCollectionAccount", 
      "tradeline.originalCreditorName",
      "tradeline.status",
      "creditor.name as creditorName"
    ])
    .where("tradeline.userId", "=", tradeline.userId)
    .execute();

  // Check rapid account openings
  if (tradeline.openedDate) {
    const openedDateObj = typeof tradeline.openedDate === 'string' 
      ? new Date(tradeline.openedDate) 
      : tradeline.openedDate;
      
    if (isValid(openedDateObj)) {
      const openedMonthYear = openedDateObj.toISOString().substring(0, 7); // YYYY-MM
      const accountsInMonth = [];
      
      for (const tl of allTradelines) {
        if (tl.openedDate) {
          const tlDateObj = typeof tl.openedDate === 'string' ? new Date(tl.openedDate) : tl.openedDate;
          if (isValid(tlDateObj) && tlDateObj.toISOString().substring(0, 7) === openedMonthYear) {
            accountsInMonth.push(tl);
          }
        }
      }
      
      if (accountsInMonth.length >= 5) {
        const uniqueCreditors = new Set(
          accountsInMonth
            .map(tl => tl.creditorName?.trim().toUpperCase())
            .filter(Boolean)
        );

        const hasDerogatory = accountsInMonth.some(tl => {
          const status = (tl.status || "").toUpperCase();
          return (
            status.includes("COLLECTION") ||
            status.includes("CHARGE OFF") ||
            status.includes("DELINQUENT") ||
            status.includes("LATE") ||
            tl.isCollectionAccount
          );
        });

        if (uniqueCreditors.size >= 4 && hasDerogatory) {
          violations.push({
            violationCategory: "IDENTITY_THEFT_VIOLATION",
            severity: "WARNING",
            confidenceScore: 60,
            userExplanation: `Multiple accounts (${accountsInMonth.length}) from ${uniqueCreditors.size} different creditors were opened in the same month (${openedMonthYear}) with at least one showing derogatory marks, indicating potential IDENTITY THEFT.`,
            technicalDetails: {
              openedMonthYear,
              countInMonth: accountsInMonth.length,
              uniqueCreditorsCount: uniqueCreditors.size,
              hasDerogatory,
              detectedValue: accountsInMonth.length,
              regulationIds: ["PIPEDA_4_3", "PIPEDA_4_7"],
            },
            recommendedAction: "Make sure you actually opened all these accounts and didn't fall victim to identity theft.",
            tradelineId: tradeline.id,
            responsibleEntity: "CREDITOR",
          });
        }
      }
    }
  }

  // Check collection accounts without original account
  const isCollection = tradeline.isCollectionAccount || 
    (tradeline.status || "").toUpperCase().includes("COLLECTION");
    
  if (isCollection && tradeline.originalCreditorName) {
    const origNameUpper = tradeline.originalCreditorName.toUpperCase();

    const thisTl = allTradelines.find(tl => tl.id === tradeline.id);
    const thisCreditorName = thisTl?.creditorName?.toUpperCase() || "";
    
    const isSelfOriginal = 
      (thisCreditorName.length > 3 && origNameUpper.includes(thisCreditorName)) || 
      (thisCreditorName.length > 0 && thisCreditorName.includes(origNameUpper));
    
    if (!isSelfOriginal) {
      const hasOriginal = allTradelines.some(tl => {
      if (tl.id === tradeline.id) return false;
      const cName = tl.creditorName?.toUpperCase() || "";
      const ocName = tl.originalCreditorName?.toUpperCase() || "";
      return (cName.length > 3 && origNameUpper.includes(cName)) || (cName.length > 0 && cName.includes(origNameUpper)) ||
             (ocName.length > 3 && origNameUpper.includes(ocName)) || (ocName.length > 0 && ocName.includes(origNameUpper));
    });
    
        if (!hasOriginal) {
      violations.push({
        violationCategory: "IDENTITY_THEFT_VIOLATION",
        severity: "INFO",
        confidenceScore: 55,
        userExplanation: "This collection account is missing the corresponding ORIGINAL CREDITOR ACCOUNT on the credit report.",
        technicalDetails: {
          originalCreditorName: tradeline.originalCreditorName,
          detectedValue: tradeline.originalCreditorName,
          regulationIds: ["PIPEDA_4_3", "PIPEDA_4_7"],
        },
        recommendedAction: "Ask the collection agency to prove who owns the debt and show their records.",
        tradelineId: tradeline.id,
        responsibleEntity: "CREDITOR",
      });
    }
    }
  }

  return violations;
}