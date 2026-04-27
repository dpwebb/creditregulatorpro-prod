import { Selectable } from "kysely";
import { Tradeline } from "./schema";
import { DetectedViolation, isEffectivelyCollectionAccount } from "./complianceDetectorTypes";
import { db } from "./db";
import { regulationRegistry } from "./regulationRegistry";
import { resolveProvinceByIds } from "./resolveTradelineProvince";

/**
 * Safely parses a JSON field if it is a string.
 */
function safeParseJsonField(value: any): any {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

/**
 * Checks if a specific json path exists and has a non-null/empty value in the extraction data.
 */
function checkFieldExists(
  extraction: any,
  path: string,
  tradeline: Selectable<Tradeline>
): boolean {
  if (!extraction) return false;

  try {
    if (path.startsWith("consumer_profile.")) {
      const key = path.split(".")[1];
      const cp = safeParseJsonField(extraction.consumerProfile) as Record<string, any>;
      return cp != null && cp[key] != null;
    }

    if (path.startsWith("portal_summary.")) {
      const key = path.split(".")[1];
      const ps = safeParseJsonField(extraction.portalSummary) as Record<string, any>;
      return ps != null && ps[key] != null;
    }

    if (path.startsWith("bureau_context.")) {
      const key = path.split(".")[1];
      const bc = safeParseJsonField(extraction.bureauContext) as Record<string, any>;
      return bc != null && bc[key] != null;
    }

    if (path === "inquiries_credit_related") {
      const inq = safeParseJsonField(extraction.inquiriesCreditRelated);
      return Array.isArray(inq) && inq.length > 0;
    }

    if (path === "insolvency_public_records") {
      return safeParseJsonField(extraction.insolvencyPublicRecords) != null;
    }

    if (path === "accounts") {
      const accounts = safeParseJsonField(extraction.accounts);
      return Array.isArray(accounts) && accounts.length > 0;
    }

    if (path.startsWith("accounts[].")) {
      const key = path.split("accounts[].")[1];
      const accounts = safeParseJsonField(extraction.accounts) as any[];
      
      if (!Array.isArray(accounts)) return false;

      // Try to find the specific account matching this tradeline
      const match = accounts.find((a) => {
        // Handle various extraction shapes (raw string vs ExtractedValue object)
        const acctNum = a.account_number_partial?.value || a.account_number_partial || a.accountNumber;
        return (
          acctNum &&
          tradeline.accountNumber &&
          tradeline.accountNumber.includes(String(acctNum))
        );
      });

      const checkKey = (a: any) => {
        if (a[key] != null) return true;
        if (key === "payment_history") {
          if (typeof a.payment_pattern === "string" && a.payment_pattern.length > 0) return true;
          if (Array.isArray(a.paymentHistoryDetails) && a.paymentHistoryDetails.length > 0) return true;
          if (a.paymentHistory != null && typeof a.paymentHistory === "object") return true;
        }
        return false;
      };

      if (match) {
        return checkKey(match);
      }

      // If we cannot reliably match the tradeline, we verify if ANY account has this data.
      // This prevents false positives when account numbers are obfuscated.
      return accounts.some((a) => checkKey(a));
    }

    // Default to true for unhandled paths to avoid false positives
    return true;
  } catch (err) {
    console.error(`[DisclosureDetector] Error evaluating path ${path}:`, err);
    return false;
  }
}

/**
 * Detects if the bureau failed to provide legally required disclosures on the credit report.
 * It dynamically maps the user's province to determine which statutory rules apply.
 *
 * @param tradeline The tradeline context for the violation
 * @param reportArtifactId Optional override for reportArtifactId (defaults to tradeline.reportArtifactId)
 */
export async function detectDisclosureDeficiency(
  tradeline: Selectable<Tradeline>,
  reportArtifactId?: number
): Promise<DetectedViolation[]> {
  const violations: DetectedViolation[] = [];
  const targetArtifactId = reportArtifactId ?? tradeline.reportArtifactId;

  if (!targetArtifactId) {
    return violations;
  }

  // 1. Determine User's Province
  const provinceCode = await resolveProvinceByIds(tradeline.userId, tradeline.reportArtifactId);

  const provMap: Record<string, string> = {
    AB: "Alberta",
    BC: "British Columbia",
    MB: "Manitoba",
    NB: "New Brunswick",
    NL: "Newfoundland and Labrador",
    NS: "Nova Scotia",
    NT: "Northwest Territories",
    NU: "Nunavut",
    ON: "Ontario",
    PE: "Prince Edward Island",
    QC: "Quebec",
    SK: "Saskatchewan",
    YT: "Yukon",
  };

  const jurisdictions = ["Federal"];
  let jurisdictionName = "Federal";

  if (provinceCode && provMap[provinceCode]) {
    jurisdictionName = provMap[provinceCode];
    jurisdictions.push(jurisdictionName);
  } else {
    console.log(`Cannot determine province for tradeline ${tradeline.id}: all lookups returned null. Skipping provincial disclosure check.`);
  }

  // 2. Fetch Applicable Disclosure Requirements (Provincial + Federal)
  const requirements = await db
    .selectFrom("disclosureRequirement")
    .innerJoin("statuteVersion", "disclosureRequirement.statuteVersionId", "statuteVersion.id")
    .innerJoin("statute", "statuteVersion.statuteId", "statute.id")
    .where("statute.jurisdiction", "in", jurisdictions)
    .select([
      "disclosureRequirement.requirementCode",
      "disclosureRequirement.description",
      "disclosureRequirement.fieldPath",
      "disclosureRequirement.severity",
      "disclosureRequirement.category",
      "statute.code as statuteCode",
    ])
    .execute();

  if (!requirements.length) {
    return violations;
  }

  // 3. Fetch Extraction Data
  const extraction = await db
    .selectFrom("passExtraction")
    .where("reportArtifactId", "=", targetArtifactId)
    .orderBy("id", "desc")
    .selectAll()
    .executeTakeFirst();

  if (!extraction) {
    violations.push({
      violationCategory: "DISCLOSURE_DEFICIENCY",
      severity: "WARNING",
      confidenceScore: 70,
      userExplanation: "The credit report is missing valid EXTRACTION DATA.",
      technicalDetails: {
        targetArtifactId,
        issue: "Missing extraction data",
        detectedValue: null,
        regulationIds: ["PIPEDA_4_9", ...(provinceCode ? [`${provinceCode}_CRA_DISCLOSURE`] : [])],
      },
      recommendedAction: "Look at your original credit report to make sure all required information is there.",
      tradelineId: tradeline.id,
      responsibleEntity: "BUREAU",
    });
    return violations;
  }

  const cpType = typeof extraction.consumerProfile;
  const parsedCp = safeParseJsonField(extraction.consumerProfile);
  const parsedCpType = typeof parsedCp;
  const cpKeys = parsedCp && typeof parsedCp === 'object' ? Object.keys(parsedCp) : [];
  const hasLegalName = parsedCp != null && parsedCp.legal_name != null;
  const parsedAccounts = safeParseJsonField(extraction.accounts);
  const accountsIsArray = Array.isArray(parsedAccounts);
  const accountsLen = accountsIsArray ? parsedAccounts.length : 0;

  console.log('[DISCLOSURE DEBUG]', JSON.stringify({ cpType, parsedCpType, cpKeys, hasLegalName, accountsIsArray, accountsLen }));

  // 4. Verify Requirements against Extracted JSON
  for (const req of requirements) {
    if (req.statuteCode) {
      const acctType = (tradeline.accountType || "").toLowerCase();
      
      if (req.statuteCode.includes("STUDENT-LOAN") || req.statuteCode.includes("NSLSC")) {
        if (!acctType.includes("student") && !acctType.includes("loan")) {
          continue;
        }
      }

      if (req.statuteCode.includes("MEDICAL-DEBT")) {
        if (!acctType.includes("medical") && !acctType.includes("health")) {
          continue;
        }
      }
    }

    if (!req.fieldPath) {
      continue; // Skip procedural requirements without a data mapping
    }

    // Skip report-level disclosures - these are evaluated at the report level, not per tradeline.
    const reportLevelPaths = [
      "inquiries_credit_related",
      "insolvency_public_records",
      "bureau_context.bureau_name",
      "bureau_context.report_generated_at"
    ];
    if (reportLevelPaths.includes(req.fieldPath) || req.fieldPath.startsWith("consumer_profile.")) {
      continue;
    }

    // Collection accounts do not track certain fields applicable to standard tradelines:
    // - status: often replaced by collection indicators
    // - payment_history: month-by-month not tracked
    // - high_credit: no credit limit or high credit amount
    // - date_opened: uses "date assigned to collection"
    if (isEffectivelyCollectionAccount(tradeline)) {
      const excludedPaths = [
        "accounts[].status",
        "accounts[].payment_history",
        "accounts[].high_credit",
        "accounts[].date_opened",
      ];
      if (excludedPaths.includes(req.fieldPath)) {
        continue;
      }
    }

    let isPresent = checkFieldExists(extraction, req.fieldPath, tradeline);

    if (!isPresent) {
      if (req.fieldPath === "accounts[].date_opened" && tradeline.openedDate != null) {
        isPresent = true;
      } else if (req.fieldPath === "accounts[].high_credit" && tradeline.highCredit != null) {
        isPresent = true;
      } else if (req.fieldPath === "accounts[].payment_history") {
        if ((tradeline.paymentPattern && typeof tradeline.paymentPattern === "string" && tradeline.paymentPattern.trim().length > 0) || tradeline.paymentHistoryProfile != null) {
          isPresent = true;
        }
      } else if (req.fieldPath === "accounts[].status" && tradeline.status != null && String(tradeline.status).trim().length > 0) {
        isPresent = true;
      }
    }

    if (!isPresent) {
      violations.push({
        violationCategory: "DISCLOSURE_DEFICIENCY",
        severity: (req.severity as any) || "ERROR",
        confidenceScore: 90,
        userExplanation: `The credit report is missing REQUIRED INFORMATION for ${req.description}.`,
        technicalDetails: {
          requirementCode: req.requirementCode,
          fieldPath: req.fieldPath,
          jurisdiction: jurisdictionName,
          detectedValue: null,
          regulationIds: ["PIPEDA_4_9", ...(provinceCode ? [`${provinceCode}_CRA_DISCLOSURE`] : [])],
        },
        recommendedAction: "Ask the credit bureau to provide a complete report with all required information.",
        tradelineId: tradeline.id,
        responsibleEntity: "BUREAU",
      });
        }
    // NOTE: Bureau contact info (address, phone, email, online dispute URL) is hardcoded
    // in the bureauDisputeAddresses helper. No need to flag missing bureau contact info
    // from the report — the system already has authoritative bureau contact data.
  }

  // Deduplicate violations by functional suffix
  const groupedViolations = new Map<string, DetectedViolation[]>();
  const deduplicatedViolations: DetectedViolation[] = [];

  for (const v of violations) {
    const reqCode = v.technicalDetails?.requirementCode;
    if (reqCode) {
      const parts = reqCode.split("-");
      const suffix = parts.length >= 2 ? parts.slice(-2).join("-") : reqCode;
      if (!groupedViolations.has(suffix)) {
        groupedViolations.set(suffix, []);
      }
      groupedViolations.get(suffix)!.push(v);
    } else {
      deduplicatedViolations.push(v);
    }
  }

  const severityRank = { ERROR: 3, WARNING: 2, INFO: 1 };

  for (const group of groupedViolations.values()) {
    if (group.length === 1) {
      const v = group[0];
      const reqCode = v.technicalDetails.requirementCode;
      const jurisdiction = v.technicalDetails.jurisdiction;
      v.technicalDetails.requirementCodes = [reqCode];
      if (jurisdiction) v.technicalDetails.jurisdictions = [jurisdiction];
      delete v.technicalDetails.requirementCode;
      delete v.technicalDetails.jurisdiction;
      deduplicatedViolations.push(v);
      continue;
    }

    group.sort((a, b) => {
      const rankA = severityRank[a.severity as keyof typeof severityRank] || 0;
      const rankB = severityRank[b.severity as keyof typeof severityRank] || 0;
      if (rankA !== rankB) return rankB - rankA;
      return b.confidenceScore - a.confidenceScore;
    });

    const best = group[0];
    const reqCodes = Array.from(new Set(group.map(v => v.technicalDetails.requirementCode).filter(Boolean)));
    const jurisdictions = Array.from(new Set(group.map(v => v.technicalDetails.jurisdiction).filter(Boolean)));

    const originalReqCode = best.technicalDetails.requirementCode;
    if (originalReqCode) {
      best.userExplanation = best.userExplanation.replace(originalReqCode, reqCodes.join(" / "));
    }

    best.technicalDetails.requirementCodes = reqCodes;
    if (jurisdictions.length > 0) best.technicalDetails.jurisdictions = jurisdictions;
    delete best.technicalDetails.requirementCode;
    delete best.technicalDetails.jurisdiction;

    deduplicatedViolations.push(best);
  }

  return deduplicatedViolations;
}