import type { Selectable } from "kysely";
import { regulationRegistry } from "./regulationRegistry";
import { db } from "./db";
import type { Tradeline, CanadianProvince } from "./schema";
import type { DetectedViolation } from "./complianceDetectorTypes";
import { isEffectivelyCollectionAccount } from "./complianceDetectorTypes";
import { differenceInDays, addYears, isBefore, isValid } from "./dateUtils";
import { resolveTradelineProvince } from "./resolveTradelineProvince";
import { extractCanonicalStatus, extractCanonicalAccountType } from "./normalizeAccountData";
import { normalizeAgencyName } from "./collectionAgencyRegistry";
import {
  resolveCreditorEntity,
  matchCreditorAcrossReports,
} from "./creditorEntityResolver";

function namesLikelySameEntity(nameA: string, nameB: string): boolean {
  if (!nameA || !nameB) return false;

  const normalizedA = normalizeAgencyName(nameA);
  const normalizedB = normalizeAgencyName(nameB);
  if (!normalizedA || !normalizedB) return false;

  if (normalizedA === normalizedB) return true;

  const match = matchCreditorAcrossReports(nameA, nameB);
  return match.isMatch && match.confidence >= 80;
}

/**
 * Compares creditor vs. bureau data for the same account. (Placeholder)
 */
export async function detectCrossEntityDiscrepancy(
  tradeline: Selectable<Tradeline>
): Promise<DetectedViolation[]> {
  const violations: DetectedViolation[] = [];

  if (!tradeline.reportArtifactId) {
    return violations;
  }

  const artifact = await db
    .selectFrom("reportArtifact")
    .select(["data"])
    .where("id", "=", tradeline.reportArtifactId)
    .executeTakeFirst();

  if (!artifact || !artifact.data) {
    return violations;
  }

  const sourceData = artifact.data as any;

  // Compare balance
  if (tradeline.balance !== null && sourceData.balance != null) {
    const storedBalance = Number(tradeline.balance);
    const sourceBalance = Number(sourceData.balance);
    if (Math.abs(storedBalance - sourceBalance) > 1) {
      violations.push({
        violationCategory: "CROSS_ENTITY_DISCREPANCY",
        severity: "WARNING",
        confidenceScore: 80,
        userExplanation: `The BALANCE doesn't match between the account record and credit report.`,
        technicalDetails: {
          tradelineId: tradeline.id,
          reportArtifactId: tradeline.reportArtifactId,
          fieldName: "balance",
          stored: storedBalance,
          source: sourceBalance,
          detectedValue: Math.abs(storedBalance - sourceBalance),
          regulationIds: ["PIPEDA_4_6"],
        },
        recommendedAction: "Check your original credit report document to see what the real balance is.",
        tradelineId: tradeline.id,
        responsibleEntity: "CREDITOR",
      });
    }
  }

  // Compare status
  if (tradeline.status && sourceData.accountStatus) {
    const storedStatus = String(tradeline.status).toUpperCase();
    const sourceStatus = String(sourceData.accountStatus).toUpperCase();
    
    const canonicalStored = extractCanonicalStatus(storedStatus);
    const canonicalSource = extractCanonicalStatus(sourceStatus);

    if (
      canonicalStored &&
      canonicalSource &&
      canonicalStored !== canonicalSource &&
      !storedStatus.includes(sourceStatus) &&
      !sourceStatus.includes(storedStatus)
    ) {
      violations.push({
        violationCategory: "CROSS_ENTITY_DISCREPANCY",
        severity: "WARNING",
        confidenceScore: 80,
        userExplanation: `The ACCOUNT STATUS doesn't match between the account record and credit report.`,
        technicalDetails: {
          tradelineId: tradeline.id,
          reportArtifactId: tradeline.reportArtifactId,
          fieldName: "status",
          stored: storedStatus,
          source: sourceStatus,
          detectedValue: storedStatus,
          regulationIds: ["PIPEDA_4_6"],
        },
        recommendedAction: "Check your original credit report document to see what the real status is.",
        tradelineId: tradeline.id,
        responsibleEntity: "CREDITOR",
      });
    }
  }

  // Compare accountType
  if (tradeline.accountType && sourceData.accountType) {
    const storedType = String(tradeline.accountType).toUpperCase();
    const sourceType = String(sourceData.accountType).toUpperCase();
    
    const canonicalStored = extractCanonicalAccountType(storedType);
    const canonicalSource = extractCanonicalAccountType(sourceType);

    if (
      canonicalStored &&
      canonicalSource &&
      canonicalStored !== canonicalSource &&
      !storedType.includes(sourceType) &&
      !sourceType.includes(storedType)
    ) {
      violations.push({
        violationCategory: "CROSS_ENTITY_DISCREPANCY",
        severity: "WARNING",
        confidenceScore: 80,
        userExplanation: `The ACCOUNT TYPE doesn't match between the account record and credit report.`,
        technicalDetails: {
          tradelineId: tradeline.id,
          reportArtifactId: tradeline.reportArtifactId,
          fieldName: "accountType",
          stored: storedType,
          source: sourceType,
          detectedValue: storedType,
          regulationIds: ["PIPEDA_4_6"],
        },
        recommendedAction: "Check your original credit report document to see what the real account type is.",
        tradelineId: tradeline.id,
        responsibleEntity: "CREDITOR",
      });
    }
  }

  // Compare openedDate
  if (tradeline.openedDate && sourceData.dateOpened) {
    const storedDate = new Date(tradeline.openedDate);
    const sourceDate = new Date(sourceData.dateOpened);
    if (isValid(storedDate) && isValid(sourceDate)) {
      const diff = Math.abs(differenceInDays(storedDate, sourceDate));
      if (diff > 5) {
        violations.push({
          violationCategory: "CROSS_ENTITY_DISCREPANCY",
          severity: "WARNING",
          confidenceScore: 80,
          userExplanation: `The OPENED DATE doesn't match between the account record and credit report.`,
          technicalDetails: {
            tradelineId: tradeline.id,
            reportArtifactId: tradeline.reportArtifactId,
            fieldName: "openedDate",
            stored: storedDate.toISOString(),
            source: sourceDate.toISOString(),
            detectedValue: diff,
            regulationIds: ["PIPEDA_4_6"],
          },
          recommendedAction: "Check your original credit report document to see what the real opened date is.",
          tradelineId: tradeline.id,
          responsibleEntity: "CREDITOR",
        });
      }
    }
  }

  return violations;
}

/**
 * Checks if multiple collectors are reporting the same account.
 */
export async function detectMultipleCollectorViolation(
  tradeline: Selectable<Tradeline>
): Promise<DetectedViolation[]> {
  if (!tradeline.originalCreditorName || !tradeline.openedDate) {
    return [];
  }

    const similarTradelines = await db
    .selectFrom("tradeline")
    .selectAll()
    .where("originalCreditorName", "=", tradeline.originalCreditorName)
    .where("openedDate", "=", tradeline.openedDate)
    .where("bureauId", "=", tradeline.bureauId as number)
    .where("id", "!=", tradeline.id as number)
    .where("userId", "=", tradeline.userId as number)
    .execute();

  if (similarTradelines.length > 0) {
    return [{
      violationCategory: "MULTIPLE_COLLECTOR_VIOLATION",
      severity: "ERROR",
      confidenceScore: 85,
      userExplanation: "This ACCOUNT is being reported by MULTIPLE COLLECTION AGENCIES.",
      technicalDetails: {
        originalTradelineId: tradeline.id,
        duplicateTradelineIds: similarTradelines.map((t) => t.id),
        originalCreditor: tradeline.originalCreditorName,
        detectedValue: similarTradelines.length,
        regulationIds: ["PIPEDA_4_6"],
      },
      recommendedAction: "Dispute the extra collection accounts so the debt only shows up once.",
      tradelineId: tradeline.id,
      responsibleEntity: "COLLECTOR",
    }];
  }

  return [];
}

/**
 * Queries for the same account across different bureaus to find inconsistencies.
 */
export async function detectCrossBureauInconsistency(
  tradeline: Selectable<Tradeline>
): Promise<DetectedViolation[]> {
  if (!tradeline.accountNumber || !tradeline.creditorId) {
    return [];
  }

  const otherBureauTradelines = await db
    .selectFrom("tradeline")
    .selectAll()
    .where("accountNumber", "=", tradeline.accountNumber)
    .where("creditorId", "=", tradeline.creditorId as number)
    .where("bureauId", "!=", tradeline.bureauId as number)
    .where("userId", "=", tradeline.userId as number)
    .execute();

  for (const otherTradeline of otherBureauTradelines) {
    const balanceDiff = Math.abs(Number(tradeline.balance) - Number(otherTradeline.balance));
    const statusDiff = tradeline.status !== otherTradeline.status;

    if (balanceDiff > 1 || statusDiff) { // Allow $1 tolerance for rounding
      return [{
        violationCategory: "CROSS_BUREAU_INCONSISTENCY",
        severity: "WARNING",
        confidenceScore: 90,
        userExplanation: "This account shows INCONSISTENT INFORMATION across different credit bureaus.",
        technicalDetails: {
          baseTradelineId: tradeline.id,
          otherTradelineId: otherTradeline.id,
          baseBureauId: tradeline.bureauId,
          otherBureauId: otherTradeline.bureauId,
          balanceDiff,
          statusDiff,
          detectedValue: { balanceDiff, statusDiff },
          regulationIds: ["PIPEDA_4_6"],
        },
        recommendedAction: "Ask the company reporting this to fix the information so it's the same everywhere.",
        tradelineId: tradeline.id,
        responsibleEntity: "BUREAU",
      }];
    }
  }

  return [];
}

/**
 * Checks if collection agent failed to validate debt within required timeframe.
 * Tracks first collection contact and flags if no validation documentation provided within 30 days.
 */
export async function detectDebtValidationFailure(
  tradeline: Selectable<Tradeline>
): Promise<DetectedViolation[]> {
  // Only check collection accounts
  const isCollection = isEffectivelyCollectionAccount(tradeline);
  if (!isCollection || !tradeline.id) {
    return [];
  }

  // Find first obligation instance related to this tradeline (first challenge/dispute)
  const firstObligation = await db
    .selectFrom("obligationInstance")
    .selectAll()
    .where("tradelineId", "=", tradeline.id as number)
    .orderBy("createdAt", "asc")
    .executeTakeFirst();

  if (!firstObligation) {
    // No challenges yet, can't determine validation failure
    return [];
  }

  const daysSinceChallenge = firstObligation.createdAt 
    ? differenceInDays(new Date(), new Date(firstObligation.createdAt))
    : 0;

  // Check if validation was provided (response received)
  const hasValidation = firstObligation.responseReceivedDate !== null;

  if (daysSinceChallenge > 30 && !hasValidation) {
    return [{
      violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
      severity: "ERROR",
      confidenceScore: 95,
      userExplanation: "The collection agency failed to provide DEBT VALIDATION within 30 days of the request.",
      technicalDetails: {
        tradelineId: tradeline.id,
        obligationInstanceId: firstObligation.id,
        challengeDate: firstObligation.createdAt,
        daysSinceChallenge,
        validationReceived: false,
        detectedValue: daysSinceChallenge,
        regulationIds: ["PIPEDA_4_6"],
      },
      recommendedAction: "Demand that they remove the collection account since they couldn't prove it's yours in time.",
      tradelineId: tradeline.id,
      responsibleEntity: "COLLECTOR",
    }];
  }

  return [];
}

/**
 * Verifies chain of ownership for collection accounts.
 * Checks if originalCreditorName is present and if debt assignment documentation exists.
 */
export async function detectOriginalCreditorChainFailure(
  tradeline: Selectable<Tradeline>
): Promise<DetectedViolation[]> {
  const violations: DetectedViolation[] = [];
  
  // Only check collection accounts
  const isCollection = isEffectivelyCollectionAccount(tradeline);
  if (!isCollection) {
    return [];
  }

  // 1. Check if original creditor name is missing or is actually a collection agency
  const ocNameRaw = tradeline.originalCreditorName || "";
  if (!ocNameRaw || ocNameRaw.trim().length === 0) {
    violations.push({
      violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
      severity: "ERROR",
      confidenceScore: 90,
      userExplanation: "This COLLECTION ACCOUNT is missing the ORIGINAL CREDITOR name.",
      technicalDetails: {
        tradelineId: tradeline.id,
        creditorId: tradeline.creditorId,
        accountNumber: tradeline.accountNumber,
        missingField: "originalCreditorName",
        detectedValue: null,
        regulationIds: ["PIPEDA_4_6"],
      },
      recommendedAction: "Dispute this account because they didn't list the original creditor.",
      tradelineId: tradeline.id,
      responsibleEntity: "COLLECTOR",
    });
    } else {
    let isFakeOC = false;
    let matchReason = "";
    const ocNameUpper = ocNameRaw.toUpperCase();

    // 1. Self-reference check
    let creditorName = "";
    if (tradeline.creditorId) {
      const creditor = await db
        .selectFrom("creditor")
        .select("name")
        .where("id", "=", tradeline.creditorId)
        .executeTakeFirst();
      if (creditor && creditor.name) {
        creditorName = creditor.name.toUpperCase();
      }
    }
    const caName = (tradeline.collectionAgencyName || "").toUpperCase();

    const checkSelfReference = (a: string, b: string) => {
      if (a.length > 3 && b.length > 3) {
        const stripSuffixes = (str: string) => {
          return str.replace(/\b(INC|LTD|CORP|LLC|ULC|INCORPORATED|LIMITED|CORPORATION)\b/g, "").trim();
        };
        const getCoreWords = (str: string) => {
          return stripSuffixes(str).split(/\s+/).filter(w => w.length > 0);
        };

        const wordsA = getCoreWords(a);
        const wordsB = getCoreWords(b);

        if (wordsA.length === 0 || wordsB.length === 0) return false;

        const isSubset = (subset: string[], superset: string[]) => 
          subset.every(word => superset.includes(word));

        return wordsA.length <= wordsB.length ? isSubset(wordsA, wordsB) : isSubset(wordsB, wordsA);
      }
      return false;
    };

    if (checkSelfReference(ocNameUpper, creditorName)) {
      isFakeOC = true;
      matchReason = "self-reference (matches creditor name)";
    } else if (checkSelfReference(ocNameUpper, caName)) {
      isFakeOC = true;
      matchReason = "self-reference (matches collection agency name)";
    }

    // 1b. Alias-aware self-reference using canonical entity matching.
    if (!isFakeOC && creditorName && namesLikelySameEntity(ocNameRaw, creditorName)) {
      isFakeOC = true;
      matchReason = "alias/self-reference (matches creditor entity alias)";
    }
    if (!isFakeOC && caName && namesLikelySameEntity(ocNameRaw, caName)) {
      isFakeOC = true;
      matchReason = "alias/self-reference (matches collection agency alias)";
    }

    // 2. Licensed agency DB check
    if (!isFakeOC) {
      const normalizedOcName = normalizeAgencyName(ocNameRaw);
      if (normalizedOcName.length > 3) {
        const matches = await db
          .selectFrom("licensedCollectionAgency")
          .select("id")
          .where("agencyNameNormalized", "like", `%${normalizedOcName}%`)
          .limit(1)
          .execute();
        
        if (matches.length > 0) {
          isFakeOC = true;
          matchReason = "matches licensed collection agency database";
        }
      }
    }

    // 2b. Canonical resolver check for known collection entities.
    if (!isFakeOC) {
      const ocEntity = resolveCreditorEntity(ocNameRaw);
      if (ocEntity.entityType === "collection") {
        isFakeOC = true;
        matchReason = `classified as collection entity (${ocEntity.canonicalName})`;
      }
    }

    // 3. Collection keyword heuristic
    if (!isFakeOC) {
      const keywords = [
        "COLLECTION", "COLLECTOR", "RECOVERY", "RECEIVABLE", 
        "LEGAL GROUP", "BAILIFF", "DEBT", "CAPITAL ASSET"
      ];
      for (const kw of keywords) {
        if (ocNameUpper.includes(kw)) {
          isFakeOC = true;
          matchReason = `contains collection keyword: ${kw}`;
          break;
        }
      }
    }

        // 4. Sibling check — find other collection tradelines with the same original creditor
    //    (don't require openedDate match since collection assignment dates vary)
    if (!isFakeOC) {
      const siblings = await db
        .selectFrom("tradeline")
        .select(["id", "creditorId", "collectionAgencyName"])
        .where("originalCreditorName", "=", tradeline.originalCreditorName)
        .where("bureauId", "=", tradeline.bureauId as number)
        .where("userId", "=", tradeline.userId as number)
        .where("id", "!=", tradeline.id as number)
        .execute();

      for (const sibling of siblings) {
        let siblingCreditorName = "";
        if (sibling.creditorId) {
          const siblingCreditor = await db
            .selectFrom("creditor")
            .select("name")
            .where("id", "=", sibling.creditorId)
            .executeTakeFirst();
          if (siblingCreditor && siblingCreditor.name) {
            siblingCreditorName = siblingCreditor.name.toUpperCase();
          }
        }
        const siblingCaName = (sibling.collectionAgencyName || "").toUpperCase();

        if (checkSelfReference(ocNameUpper, siblingCreditorName)) {
          isFakeOC = true;
          matchReason = `matches sibling collection agency creditor name: ${siblingCreditorName}`;
          break;
        } else if (checkSelfReference(ocNameUpper, siblingCaName)) {
          isFakeOC = true;
          matchReason = `matches sibling collection agency name: ${siblingCaName}`;
          break;
        }
      }
    }

    if (isFakeOC) {
      violations.push({
        violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
        severity: "ERROR",
        confidenceScore: 85,
        userExplanation: "The listed original creditor appears to be another collection agency, not the real original creditor. The true original creditor is unknown.",
        technicalDetails: {
          tradelineId: tradeline.id,
          originalCreditorName: ocNameRaw,
          matchReason,
          detectedValue: ocNameRaw,
          regulationIds: ["PIPEDA_4_6"],
        },
        recommendedAction: "Dispute this account because they didn't list the real original creditor.",
        tradelineId: tradeline.id,
        responsibleEntity: "COLLECTOR",
      });
    }

    // 5. Same tradeline collection identity drift across snapshots.
    // If the collector name keeps changing materially between pulls, we flag it.
    if (tradeline.id) {
      const snapshots = await db
        .selectFrom("tradelineSnapshot")
        .select(["collectionAgencyName", "creditorName", "snapshotAt"])
        .where("tradelineId", "=", tradeline.id as number)
        .orderBy("snapshotAt", "desc")
        .limit(12)
        .execute();

      const rawNames = snapshots
        .map((s) => s.collectionAgencyName || s.creditorName || "")
        .map((n) => n.trim())
        .filter((n) => n.length > 0);

      const uniqueNames: string[] = [];
      for (const name of rawNames) {
        if (!uniqueNames.some((existing) => namesLikelySameEntity(existing, name))) {
          uniqueNames.push(name);
        }
      }

      if (uniqueNames.length >= 2) {
        violations.push({
          violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
          severity: "WARNING",
          confidenceScore: 82,
          userExplanation:
            "The collection agency name changes across reports for this same debt, which may indicate identity inconsistency.",
          technicalDetails: {
            tradelineId: tradeline.id,
            fieldName: "collectionAgencyName",
            uniqueCollectorNames: uniqueNames,
            detectedValue: uniqueNames.length,
            regulationIds: ["PIPEDA_4_6"],
          },
          recommendedAction:
            "Demand proof of the collector's exact legal identity and chain of authority to report this debt.",
          tradelineId: tradeline.id,
          responsibleEntity: "COLLECTOR",
        });
      }
    }
  }

  // 2. Check if debt assignment documentation exists in evidence attachments
  if (tradeline.id) {
    const obligationInstances = await db
      .selectFrom("obligationInstance")
      .select("id")
      .where("tradelineId", "=", tradeline.id as number)
      .execute();

    const obligationInstanceIds = obligationInstances.map(o => o.id);

    if (obligationInstanceIds.length > 0) {
      const assignmentDocs = await db
        .selectFrom("evidenceAttachment")
        .selectAll()
        .where("obligationInstanceId", "in", obligationInstanceIds)
        .where((eb) => eb.or([
          eb("description", "like", "%assignment%"),
          eb("description", "like", "%chain of ownership%"),
          eb("fileName", "like", "%assignment%"),
        ]))
        .execute();

      if (assignmentDocs.length === 0) {
        violations.push({
          violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
          severity: "WARNING",
          confidenceScore: 75,
          userExplanation: "The collection agency failed to provide CHAIN OF OWNERSHIP documentation.",
          technicalDetails: {
            tradelineId: tradeline.id,
            creditorId: tradeline.creditorId,
            obligationInstanceIds,
            assignmentDocsFound: 0,
            detectedValue: 0,
            regulationIds: ["PIPEDA_4_6"],
          },
          recommendedAction: "Ask the collection agency to send you the official documents proving they bought or own the debt.",
          tradelineId: tradeline.id,
          responsibleEntity: "COLLECTOR",
        });
      }
    }
  }

  return violations;
}

