import { db } from "./db";
import { ParsedTradeline } from "./reportParser";
import { findOrCreateCreditor } from "./creditorMatcher";
import { resolveCreditorEntity } from "./creditorEntityResolver";
import { ensureInitialSnapshot } from "./tradelineSnapshotManager";

/**
 * Finds an existing tradeline for the given user and parsed tradeline data.
 * Uses a two-tier matching strategy:
 * 1. Exact match: userId + accountNumber (when accountNumber is not "Unknown" or empty)
 * 2. Fallback match: userId + creditorId (for tradelines with Unknown/empty account numbers or when exact match fails)
 * 
 * @param excludeIds Set of tradeline IDs to exclude from matching (already matched in this batch)
 */
async function findExistingTradeline(
  trx: any,
  userId: number,
  creditorId: number,
  bureauId: number | null,
  parsedData: ParsedTradeline,
  excludeIds: Set<number>
): Promise<{ id: number; accountNumber: string; matchType: 'fallback' } | null> {
  let query = trx
    .selectFrom("tradeline")
    .select(["id", "accountNumber", "currentBalance", "status", "openedDate"])
    .where("userId", "=", userId)
    .where("creditorId", "=", creditorId)
    .forUpdate();

  if (bureauId !== null) {
    query = query.where("bureauId", "=", bureauId);
  }
  
  if (excludeIds.size > 0) {
    query = query.where("id", "not in", Array.from(excludeIds));
  }
  
  const candidates = await query.execute();

  if (candidates.length === 0) {
    console.log(`[Ingest] No existing tradeline found for creditorId ${creditorId}`);
    return null;
  }

  if (candidates.length === 1) {
    console.log(`[Ingest] Found single match by creditorId for tradeline ID: ${candidates[0].id}`);
    return { id: candidates[0].id, accountNumber: candidates[0].accountNumber, matchType: 'fallback' };
  }

  // Multiple candidates: disambiguate
  let bestCandidate = null;
  let bestScore = -1;

  for (const candidate of candidates) {
    let score = 0;
    
    // Balance tolerance (10%)
    if (candidate.currentBalance != null && parsedData.balance != null) {
      const minBal = Math.min(Number(candidate.currentBalance), parsedData.balance);
      const maxBal = Math.max(Number(candidate.currentBalance), parsedData.balance);
      if (maxBal === 0 || (maxBal - minBal) / maxBal <= 0.1) {
        score += 10;
      }
    }

    // Status string similarity
    if (candidate.status && parsedData.status) {
      const s1 = candidate.status.toLowerCase();
      const s2 = parsedData.status.toLowerCase();
      if (s1 === s2) score += 5;
      else if (s1.includes(s2) || s2.includes(s1)) score += 3;
    }

    // Date overlap (openedDate)
    if (candidate.openedDate && parsedData.dates.opened) {
      const d1 = new Date(candidate.openedDate).getTime();
      const d2 = new Date(parsedData.dates.opened).getTime();
      const diffDays = Math.abs(d1 - d2) / (1000 * 60 * 60 * 24);
      if (diffDays <= 31) score += 10;
      else if (diffDays <= 90) score += 5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  if (bestCandidate) {
    console.log(`[Ingest] Found closest match among multiple candidates for creditorId ${creditorId} (tradeline ID: ${bestCandidate.id})`);
    return { id: bestCandidate.id, accountNumber: bestCandidate.accountNumber, matchType: 'fallback' };
  }

  return null;
}

/**
 * Merges new tradeline data with existing data using a "prefer non-null, newer value" strategy.
 */
function mergeTradelineData(
  existingAccountNumber: string,
  newAccountNumber: string,
  newData: Record<string, any>
): { accountNumber?: string; updatedFields: Record<string, any> } {
  return { updatedFields: { ...newData } };
}

/**
 * Persists parsed tradelines to the database.
 * Handles creating new tradelines or updating existing ones with intelligent matching and merging.
 * Returns an array of tradeline IDs.
 */
export async function persistTradelines(
  userId: number,
  reportArtifactId: number,
  parsedTradelines: ParsedTradeline[],
  detectedBureauId: number | null
): Promise<{ tradelineIds: number[]; createdTradelineIds: number[]; updatedTradelineIds: number[] }> {
  const tradelineIds: number[] = [];
  const createdTradelineIds: number[] = [];
  const updatedTradelineIds: number[] = [];
  const matchedTradelineIds = new Set<number>(); // Track matched tradelines to prevent double-matching

  console.log(`[Ingest] Persisting ${parsedTradelines.length} tradelines to database for user ${userId}`);

  for (const parsedTradeline of parsedTradelines) {
    // Find or create creditor for this tradeline
    const entity = resolveCreditorEntity(parsedTradeline.creditorName);
    const creditorNameForDb = entity.entityType !== "other" ? entity.canonicalName : parsedTradeline.creditorName;

    // Audit log: show original name vs resolved canonical name
    if (entity.entityType !== "other" && entity.canonicalName !== parsedTradeline.creditorName) {
      console.log(
        `[Ingest] Creditor name resolved: "${parsedTradeline.creditorName}" -> "${entity.canonicalName}" (${entity.entityType})`
      );
    }

    const creditorId = await findOrCreateCreditor(creditorNameForDb);

    const isCollection = parsedTradeline.isCollectionAccount || entity.entityType === "collection";

    // Ensure all tradelines have a denormalized originalCreditorName.
    // Use creditorNameForDb as the base if the parsed tradeline doesn't supply one, EXCEPT for collection accounts.
    if (!parsedTradeline.originalCreditorName && !isCollection) {
      parsedTradeline.originalCreditorName = creditorNameForDb;
      console.log(
        `[Ingest] Set originalCreditorName="${creditorNameForDb}" from resolved creditor for account ${parsedTradeline.accountNumber}`
      );
    }

    await db.transaction().execute(async (trx) => {
      // Use intelligent matching to find existing tradeline
      // Pass matchedTradelineIds to prevent re-matching the same tradeline in this batch
      const existingTradeline = await findExistingTradeline(
        trx,
        userId,
        creditorId,
        detectedBureauId,
        parsedTradeline,
        matchedTradelineIds
      );

      // Prepare fields for insert/update
      const tradelineData = {
        accountType: parsedTradeline.accountType ? parsedTradeline.accountType.substring(0, 100) : null,
        status: parsedTradeline.status ? parsedTradeline.status.substring(0, 255) : null,
        balance: parsedTradeline.balance,
        currentBalance: parsedTradeline.balance,
        amountPastDue: parsedTradeline.amounts.pastDue ?? null,
        highCredit: parsedTradeline.amounts.high ?? null,
        creditLimit: parsedTradeline.creditLimit ?? null,
        openedDate: parsedTradeline.dates.opened ?? null,
        dateClosed: parsedTradeline.dates.closed ?? null,
        dateOfFirstDelinquency: parsedTradeline.dates.dofd ?? null,
        lastReportedDate: parsedTradeline.dates.reported ?? null,
        dateOfLastPayment: parsedTradeline.lastPaymentDate ?? null,
        originalCreditorName: parsedTradeline.originalCreditorName ?? null,
        creditorId: creditorId,
        bureauId: detectedBureauId,
        reportArtifactId: reportArtifactId,
        sourceText: parsedTradeline.sourceText ?? null,
        isCollectionAccount: parsedTradeline.isCollectionAccount ?? false,
        collectionAgencyName: parsedTradeline.collectionAgencyName ?? null,
        dateAssignedToCollection: parsedTradeline.dateAssignedToCollection ?? null,
        originalBalance: parsedTradeline.originalBalance ?? null,
        interestRate: parsedTradeline.interestRate ?? null,
        terms: parsedTradeline.terms ?? null,
        monthlyPayment: parsedTradeline.monthlyPayment ?? null,
        lastActivityDate: parsedTradeline.lastActivityDate ?? null,
        responsibilityCode: parsedTradeline.responsibilityCode ? parsedTradeline.responsibilityCode.substring(0, 50) : null,
        ecoaCode: parsedTradeline.ecoaCode ? parsedTradeline.ecoaCode.substring(0, 1) : null,
        lastPaymentAmount: parsedTradeline.lastPaymentAmount ?? null,
        maturityDate: parsedTradeline.maturityDate ?? null,
        postedDate: parsedTradeline.postedDate ?? null,
        chargeOffDate: parsedTradeline.chargeOffDate ?? null,
        balloonPaymentDate: parsedTradeline.balloonPaymentDate ?? null,
        paymentPattern: parsedTradeline.paymentPattern ? parsedTradeline.paymentPattern.substring(0, 255) : null,
        mop: parsedTradeline.mop ?? null,
        monthsReviewed: (parsedTradeline as any).monthsReviewed ?? null,
        creditorPhone: (parsedTradeline as any).creditorPhone ?? null,
        memberNumber: (parsedTradeline as any).memberNumber ?? null,
        ratingCode: (parsedTradeline as any).ratingCode ?? null,
        ratingCodeDescription: (parsedTradeline as any).ratingCodeDescription ?? null,
        amountWrittenOff: (parsedTradeline as any).amountWrittenOff ?? null,
        notes: (parsedTradeline as any).notes ?? null,
        dateVerified: (parsedTradeline as any).dateVerified ?? null,
        datePaidSettled: (parsedTradeline as any).datePaidSettled ?? null,
      };

      // ECOA Code derivation from responsibilityCode
      if (!tradelineData.ecoaCode && tradelineData.responsibilityCode) {
        const r = tradelineData.responsibilityCode.toLowerCase();
        if (r.includes("individual")) tradelineData.ecoaCode = "I";
        else if (r.includes("joint")) tradelineData.ecoaCode = "J";
        else if (r.includes("authorized")) tradelineData.ecoaCode = "A";
        else if (r.includes("cosigner") || r.includes("co-signer")) tradelineData.ecoaCode = "C";
      }

      // Collection-status inference based on known entity type
      if (entity.entityType === "collection" && !tradelineData.isCollectionAccount) {
        tradelineData.isCollectionAccount = true;
        console.log(`[Ingest] Inferred isCollectionAccount=true from known collection entity type for account ${parsedTradeline.accountNumber}`);
      }

      if (tradelineData.isCollectionAccount && !tradelineData.collectionAgencyName) {
        tradelineData.collectionAgencyName = creditorNameForDb;
        console.log(`[Ingest] Set collectionAgencyName="${creditorNameForDb}" for collection account ${parsedTradeline.accountNumber}`);
      }

      if (existingTradeline) {
        // Ensure we have a "before" snapshot before updating
        await ensureInitialSnapshot(existingTradeline.id);

        // Merge data intelligently
        const { accountNumber: updatedAccountNumber, updatedFields } = mergeTradelineData(
          existingTradeline.accountNumber,
          parsedTradeline.accountNumber,
          tradelineData
        );

        console.log(
          `[Ingest] Updating existing tradeline ${existingTradeline.id} (${existingTradeline.matchType} match) for account ${parsedTradeline.accountNumber}`
        );

        // Build the update object
        const updateData: Record<string, any> = { ...updatedFields };
        if (updatedAccountNumber) {
          updateData.accountNumber = updatedAccountNumber;
        }

        await trx
          .updateTable("tradeline")
          .set(updateData)
          .where("id", "=", existingTradeline.id)
          .execute();

        tradelineIds.push(existingTradeline.id);
        updatedTradelineIds.push(existingTradeline.id);
        matchedTradelineIds.add(existingTradeline.id); // Mark this tradeline as matched
      } else {
        // Insert new tradeline
        console.log(`[Ingest] Inserting new tradeline for account ${parsedTradeline.accountNumber} with creditorId ${creditorId}`);

        const newTradeline = await trx
          .insertInto("tradeline")
          .values({
            ...tradelineData,
            userId: userId,
            accountNumber: parsedTradeline.accountNumber,
            paymentHistoryProfile: parsedTradeline.paymentPattern || null,
          })
          .returning("id")
          .executeTakeFirstOrThrow();

        tradelineIds.push(newTradeline.id);
        createdTradelineIds.push(newTradeline.id);
        matchedTradelineIds.add(newTradeline.id); // Mark new tradeline as matched
      }
    });
  }

  console.log(`[Ingest] Persisted ${tradelineIds.length} tradelines with IDs: ${tradelineIds.join(", ")}`);
  
  if (tradelineIds.length > 0) {
    const presenceRows = tradelineIds.map((id) => ({
      reportArtifactId,
      tradelineId: id,
    }));
    await db
      .insertInto("tradelineArtifactPresence")
      .values(presenceRows)
      .onConflict((oc) => oc.columns(["reportArtifactId", "tradelineId"]).doNothing())
      .execute();
  }

  return { tradelineIds, createdTradelineIds, updatedTradelineIds };
}
