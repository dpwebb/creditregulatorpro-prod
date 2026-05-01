import { db } from "./db";
import { ParsedTradeline } from "./reportParser";
import { findOrCreateCreditor } from "./creditorMatcher";
import { resolveCreditorEntity } from "./creditorEntityResolver";
import { ensureInitialSnapshot } from "./tradelineSnapshotManager";

type TradelineMatchType = "account_number" | "corroborated";
type TradelineScoreResult = {
  score: number;
  matchType: TradelineMatchType;
  strongAnchors: string[];
};

type TradelineCandidate = {
  id: number;
  accountNumber: string;
  currentBalance: string | number | null;
  status: string | null;
  openedDate: Date | string | null;
  accountType: string | null;
  highCredit: string | number | null;
  creditLimit: string | number | null;
  lastReportedDate: Date | string | null;
  responsibilityCode: string | null;
  originalCreditorName: string | null;
  collectionAgencyName: string | null;
  isCollectionAccount: boolean | null;
};

const MIN_ACCOUNT_NUMBER_MATCH_SCORE = 40;
const MIN_CORROBORATED_MATCH_SCORE = 45;
const AMBIGUOUS_MATCH_SCORE_MARGIN = 15;

function normalizeAccountNumber(value: string | null | undefined): string | null {
  const normalized = (value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (
    !normalized ||
    normalized === "UNKNOWN" ||
    normalized === "NA" ||
    normalized === "NOTREPORTED" ||
    normalized === "NOTPROVIDED" ||
    normalized === "NOTAVAILABLE"
  ) {
    return null;
  }
  return normalized;
}

function accountNumbersMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeAccountNumber(a);
  const right = normalizeAccountNumber(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const minLength = Math.min(left.length, right.length);
  return minLength >= 4 && (left.endsWith(right) || right.endsWith(left));
}

function accountNumbersConflict(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeAccountNumber(a);
  const right = normalizeAccountNumber(b);
  if (!left || !right) return false;
  if (accountNumbersMatch(left, right)) return false;
  return left.length >= 4 && right.length >= 4;
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function amountsClose(a: string | number | null | undefined, b: string | number | null | undefined, tolerance = 0.1): boolean {
  const left = toNumber(a);
  const right = toNumber(b);
  if (left === null || right === null) return false;
  const max = Math.max(Math.abs(left), Math.abs(right));
  if (max === 0) return true;
  return Math.abs(left - right) / max <= tolerance;
}

function hasComparableAmount(value: string | number | null | undefined): boolean {
  const amount = toNumber(value);
  return amount !== null && amount > 0;
}

function daysApart(a: Date | string | null | undefined, b: Date | string | null | undefined): number | null {
  if (!a || !b) return null;
  const left = new Date(a).getTime();
  const right = new Date(b).getTime();
  if (Number.isNaN(left) || Number.isNaN(right)) return null;
  return Math.abs(left - right) / (1000 * 60 * 60 * 24);
}

function textLooksSimilar(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = (a || "").trim().toLowerCase();
  const right = (b || "").trim().toLowerCase();
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function scoreTradelineCandidate(
  candidate: TradelineCandidate,
  parsedData: ParsedTradeline
): TradelineScoreResult | null {
  if (accountNumbersConflict(candidate.accountNumber, parsedData.accountNumber)) {
    return null;
  }

  let score = 0;
  let matchType: TradelineMatchType = "corroborated";
  const strongAnchors: string[] = [];

  if (accountNumbersMatch(candidate.accountNumber, parsedData.accountNumber)) {
    score += 40;
    matchType = "account_number";
    strongAnchors.push("account_number");
  }

  const openedDiff = daysApart(candidate.openedDate, parsedData.dates.opened);
  if (openedDiff !== null) {
    if (openedDiff <= 31) {
      score += 25;
      strongAnchors.push("opened_date");
    } else if (openedDiff <= 90) {
      score += 12;
    }
  }

  const reportedDiff = daysApart(candidate.lastReportedDate, parsedData.dates.reported);
  if (reportedDiff !== null && reportedDiff <= 45) score += 5;

  if (textLooksSimilar(candidate.accountType, parsedData.accountType)) score += 12;
  if (textLooksSimilar(candidate.status, parsedData.status)) score += 6;
  if (textLooksSimilar(candidate.responsibilityCode, parsedData.responsibilityCode)) score += 5;
  if (textLooksSimilar(candidate.originalCreditorName, parsedData.originalCreditorName)) {
    score += 8;
    if (parsedData.isCollectionAccount) strongAnchors.push("original_creditor");
  }
  if (textLooksSimilar(candidate.collectionAgencyName, parsedData.collectionAgencyName)) {
    score += 8;
    if (parsedData.isCollectionAccount) strongAnchors.push("collection_agency");
  }

  if (amountsClose(candidate.highCredit, parsedData.amounts.high, 0.05)) {
    score += 15;
    if (hasComparableAmount(candidate.highCredit) && hasComparableAmount(parsedData.amounts.high)) {
      strongAnchors.push("high_credit");
    }
  }
  if (amountsClose(candidate.creditLimit, parsedData.creditLimit, 0.05)) {
    score += 12;
    if (hasComparableAmount(candidate.creditLimit) && hasComparableAmount(parsedData.creditLimit)) {
      strongAnchors.push("credit_limit");
    }
  }
  if (amountsClose(candidate.currentBalance, parsedData.balance, 0.1)) score += 8;

  const parsedIsCollection = parsedData.isCollectionAccount ?? false;
  if ((candidate.isCollectionAccount ?? false) === parsedIsCollection) score += 4;

  return { score, matchType, strongAnchors };
}

/**
 * Finds an existing tradeline for the given user and parsed tradeline data.
 * Account numbers are optional evidence because some bureau reports omit them.
 * A same-creditor candidate must still meet a corroboration threshold before
 * it can be updated.
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
): Promise<{ id: number; accountNumber: string; matchType: TradelineMatchType; matchScore: number } | null> {
  let query = trx
    .selectFrom("tradeline")
    .select([
      "id",
      "accountNumber",
      "currentBalance",
      "status",
      "openedDate",
      "accountType",
      "highCredit",
      "creditLimit",
      "lastReportedDate",
      "responsibilityCode",
      "originalCreditorName",
      "collectionAgencyName",
      "isCollectionAccount",
    ])
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

  const scoredCandidates: Array<{
    candidate: typeof candidates[number];
    score: number;
    matchType: TradelineMatchType;
    strongAnchors: string[];
  }> = [];

  for (const candidate of candidates) {
    const scored = scoreTradelineCandidate(candidate as TradelineCandidate, parsedData);
    if (!scored) continue;

    scoredCandidates.push({
      candidate,
      score: scored.score,
      matchType: scored.matchType,
      strongAnchors: scored.strongAnchors,
    });
  }

  scoredCandidates.sort((a, b) => b.score - a.score);

  const accountNumberMatch = scoredCandidates.find(
    (entry) => entry.matchType === "account_number" && entry.score >= MIN_ACCOUNT_NUMBER_MATCH_SCORE
  );

  if (accountNumberMatch) {
    console.log(
      `[Ingest] Matched existing tradeline ${accountNumberMatch.candidate.id} by account number evidence (score ${accountNumberMatch.score})`
    );
    return {
      id: accountNumberMatch.candidate.id,
      accountNumber: accountNumberMatch.candidate.accountNumber,
      matchType: accountNumberMatch.matchType,
      matchScore: accountNumberMatch.score,
    };
  }

  const corroboratedCandidates = scoredCandidates.filter(
    (entry) =>
      entry.matchType === "corroborated" &&
      entry.score >= MIN_CORROBORATED_MATCH_SCORE &&
      entry.strongAnchors.length > 0
  );

  const bestCandidate = corroboratedCandidates[0];
  const secondCandidate = corroboratedCandidates[1];

  if (bestCandidate && secondCandidate && secondCandidate.score >= bestCandidate.score - AMBIGUOUS_MATCH_SCORE_MARGIN) {
    console.warn(
      `[Ingest] Ambiguous same-creditor match for creditorId ${creditorId}. Best candidates ${bestCandidate.candidate.id}/${secondCandidate.candidate.id} scored ${bestCandidate.score}/${secondCandidate.score}; inserting new tradeline instead of updating.`
    );
    return null;
  }

  if (bestCandidate) {
    console.log(
      `[Ingest] Matched existing tradeline ${bestCandidate.candidate.id} by corroborated evidence (score ${bestCandidate.score}, anchors ${bestCandidate.strongAnchors.join(", ")})`
    );
    return {
      id: bestCandidate.candidate.id,
      accountNumber: bestCandidate.candidate.accountNumber,
      matchType: bestCandidate.matchType,
      matchScore: bestCandidate.score,
    };
  }

  console.log(
    `[Ingest] No sufficiently corroborated match found for creditorId ${creditorId}. Best score: ${scoredCandidates[0]?.score ?? -1}`
  );
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
  const updatedFields: Record<string, any> = {};

  for (const [key, value] of Object.entries(newData)) {
    if (value === null || value === undefined || value === "") continue;
    updatedFields[key] = value;
  }

  const existingNormalized = normalizeAccountNumber(existingAccountNumber);
  const newNormalized = normalizeAccountNumber(newAccountNumber);
  const accountNumber =
    newNormalized && (!existingNormalized || accountNumbersMatch(existingAccountNumber, newAccountNumber))
      ? newAccountNumber
      : undefined;

  return { accountNumber, updatedFields };
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
          `[Ingest] Updating existing tradeline ${existingTradeline.id} (${existingTradeline.matchType} match, score ${existingTradeline.matchScore}) for account ${parsedTradeline.accountNumber || "not reported"}`
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
