import { db } from "./db";
import { routeHtmlToComprehensiveResult } from "./bureauDetectionRouter";
import { resolveCreditorEntity } from "./creditorEntityResolver";
import { findOrCreateCreditor } from "./creditorMatcher";
import { scanAndPersistViolations } from "./complianceScanner";

/**
 * Checks whether a database value is considered stale (missing or unknown).
 */
function isStale(val: any): boolean {
  return val === null || val === undefined || val === "" || val === "Unknown";
}

/**
 * Parses the raw HTML of a stored artifact and updates existing tradelines
 * with any new extracted fields using a "prefer non-null new value" strategy.
 * Automatically runs compliance scans on updated tradelines.
 * 
 * @param artifactId The ID of the report artifact to reparse
 * @returns Count of updated tradelines and an array of error messages
 */
export async function tradelineReparseSync(artifactId: number): Promise<{ updated: number; errors: string[] }> {
  let updatedCount = 0;
  const errors: string[] = [];

  try {
    // 1. Load the artifact and extract raw HTML
    const artifact = await db
      .selectFrom("reportArtifact")
      .selectAll()
      .where("id", "=", artifactId)
      .executeTakeFirst();

    if (!artifact || !artifact.data) {
      return { updated: 0, errors: ["Artifact not found or has no data"] };
    }

    // Safely handle JSON
    const data = typeof artifact.data === "string" ? JSON.parse(artifact.data) : artifact.data;
    const html = data?.docstrangeRawHtml;

    if (!html || typeof html !== "string") {
      return { updated: 0, errors: [] }; // No HTML to parse
    }

    // 3. Parse HTML
    const parsedResult = routeHtmlToComprehensiveResult(html);
    const parsedTradelines = parsedResult.tradelines;

    if (!parsedTradelines || parsedTradelines.length === 0) {
      return { updated: 0, errors: [] };
    }

    // 4. Load existing tradelines
    const dbTradelines = await db
      .selectFrom("tradeline")
      .leftJoin("creditor", "creditor.id", "tradeline.creditorId")
      .selectAll("tradeline")
      .select("creditor.name as creditorName")
      .where("tradeline.reportArtifactId", "=", artifactId)
      .execute();

    if (dbTradelines.length === 0) {
      return { updated: 0, errors: ["No existing tradelines found for this artifact"] };
    }

    const updatedIds = new Set<number>();

    // 5. Match and Update
    for (const pt of parsedTradelines) {
      try {
        // Resolve canonical name and match creditor ID
        const entity = resolveCreditorEntity(pt.creditorName);
        const creditorNameForDb = entity.entityType !== "other" ? entity.canonicalName : pt.creditorName;
        const creditorId = await findOrCreateCreditor(creditorNameForDb);

        // Find match: 1. by creditorId
        let matchedDb = dbTradelines.find((t) => !updatedIds.has(t.id) && t.creditorId === creditorId);

        // 2. Multi-signal fallback matching
        if (!matchedDb) {
          let bestCandidate = null;
          let bestScore = -1;

          for (const candidate of dbTradelines) {
            if (updatedIds.has(candidate.id)) continue;

            let score = 0;

            // Account number overlap (+20)
            const cAcc = candidate.accountNumber;
            const pAcc = pt.accountNumber;
            if (cAcc && pAcc && cAcc !== "Unknown" && pAcc !== "Unknown" && cAcc.trim() !== "" && pAcc.trim() !== "") {
              if (cAcc === pAcc || cAcc.includes(pAcc) || pAcc.includes(cAcc)) {
                score += 20;
              }
            }

            // Balance within 10% tolerance (+10)
            if (candidate.currentBalance != null && pt.balance != null) {
              const minBal = Math.min(Number(candidate.currentBalance), pt.balance);
              const maxBal = Math.max(Number(candidate.currentBalance), pt.balance);
              if (maxBal === 0 || (maxBal - minBal) / maxBal <= 0.1) {
                score += 10;
              }
            }

            // Status string similarity (+5)
            if (candidate.status && pt.status) {
              const s1 = candidate.status.toLowerCase();
              const s2 = pt.status.toLowerCase();
              if (s1 === s2) score += 5;
              else if (s1.includes(s2) || s2.includes(s1)) score += 3;
            }

            // Opened date within 31 days (+10)
            if (candidate.openedDate && pt.dates?.opened) {
              const d1 = new Date(candidate.openedDate).getTime();
              const d2 = new Date(pt.dates.opened).getTime();
              const diffDays = Math.abs(d1 - d2) / (1000 * 60 * 60 * 24);
              if (diffDays <= 31) score += 10;
            }

            // Creditor name fuzzy match (+15)
            const cName = candidate.creditorName || candidate.originalCreditorName;
            if (cName && pt.creditorName) {
              const n1 = cName.toLowerCase();
              const n2 = pt.creditorName.toLowerCase();
              if (n1 === n2 || n1.includes(n2) || n2.includes(n1)) score += 15;
            }

            if (score > bestScore) {
              bestScore = score;
              bestCandidate = candidate;
            }
          }

          if (bestCandidate && bestScore >= 15) {
            matchedDb = bestCandidate;
          }
        }

        if (!matchedDb) {
          continue; // Could not reliably match this parsed tradeline to an existing one
        }

        // 6 & 7. Calculate field updates using "prefer non-null new value" strategy
        const updates: Record<string, any> = {};

        if (isStale(matchedDb.accountType) && !isStale(pt.accountType)) {
          updates.accountType = pt.accountType?.substring(0, 100);
        }
        if (isStale(matchedDb.responsibilityCode) && !isStale(pt.responsibilityCode)) {
          updates.responsibilityCode = pt.responsibilityCode?.substring(0, 50);
        }
        if (isStale(matchedDb.highCredit) && !isStale(pt.amounts?.high)) {
          updates.highCredit = pt.amounts.high;
        }
        if (isStale(matchedDb.mop) && !isStale(pt.mop)) {
          updates.mop = pt.mop;
        }
        if (isStale(matchedDb.creditLimit) && !isStale(pt.creditLimit)) {
          updates.creditLimit = pt.creditLimit;
        }
        if (isStale(matchedDb.amountPastDue) && !isStale(pt.amounts?.pastDue)) {
          updates.amountPastDue = pt.amounts.pastDue;
        }
        if (isStale(matchedDb.status) && !isStale(pt.status)) {
          updates.status = pt.status?.substring(0, 255);
        }
        if (isStale(matchedDb.openedDate) && !isStale(pt.dates?.opened)) {
          updates.openedDate = pt.dates.opened;
        }
        if (isStale(matchedDb.dateClosed) && !isStale(pt.dates?.closed)) {
          updates.dateClosed = pt.dates.closed;
        }
        if (isStale(matchedDb.dateOfFirstDelinquency) && !isStale(pt.dates?.dofd)) {
          updates.dateOfFirstDelinquency = pt.dates.dofd;
        }
        if (isStale(matchedDb.dateOfLastPayment) && !isStale(pt.lastPaymentDate)) {
          updates.dateOfLastPayment = pt.lastPaymentDate;
        }
        if (isStale(matchedDb.lastActivityDate) && !isStale(pt.lastActivityDate)) {
          updates.lastActivityDate = pt.lastActivityDate;
        }
        if (isStale(matchedDb.lastReportedDate) && !isStale(pt.dates?.reported)) {
          updates.lastReportedDate = pt.dates.reported;
        }
        if (isStale(matchedDb.postedDate) && !isStale(pt.postedDate)) {
          updates.postedDate = pt.postedDate;
        }
        if (isStale(matchedDb.chargeOffDate) && !isStale(pt.chargeOffDate)) {
          updates.chargeOffDate = pt.chargeOffDate;
        }
        if (isStale(matchedDb.balloonPaymentDate) && !isStale(pt.balloonPaymentDate)) {
          updates.balloonPaymentDate = pt.balloonPaymentDate;
        }
        if (isStale(matchedDb.paymentPattern) && !isStale(pt.paymentPattern)) {
          updates.paymentPattern = pt.paymentPattern?.substring(0, 255);
        }
        if (isStale(matchedDb.terms) && !isStale(pt.terms)) {
          updates.terms = pt.terms;
        }

        // 8. Execute update and trigger compliance rescan if fields changed
        if (Object.keys(updates).length > 0) {
          await db
            .updateTable("tradeline")
            .set(updates)
            .where("id", "=", matchedDb.id)
            .execute();

          updatedCount++;
          updatedIds.add(matchedDb.id);

          try {
            await scanAndPersistViolations(matchedDb.id);
          } catch (scanError) {
            errors.push(
              `Scan failed for updated tradeline ${matchedDb.id}: ${
                scanError instanceof Error ? scanError.message : String(scanError)
              }`
            );
          }
        }
      } catch (matchError) {
        errors.push(
          `Failed processing tradeline for creditor ${pt.creditorName}: ${
            matchError instanceof Error ? matchError.message : String(matchError)
          }`
        );
      }
    }
  } catch (err) {
    errors.push(`Fatal error during sync: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { updated: updatedCount, errors };
}