import { db } from "./db";

/**
 * Creates a snapshot of the current state of a tradeline.
 * 
 * @param tradelineId The ID of the tradeline to snapshot.
 * @param reportArtifactId Optional ID of the report artifact that triggered the update.
 * @returns The newly created tradelineSnapshot record.
 */
export async function createSnapshot(tradelineId: number, reportArtifactId?: number) {
  const tradelineRow = await db
    .selectFrom("tradeline")
    .leftJoin("creditor", "creditor.id", "tradeline.creditorId")
    .where("tradeline.id", "=", tradelineId)
    .select([
      "tradeline.accountNumber",
      "tradeline.accountType",
      "tradeline.status",
      "tradeline.balance",
      "tradeline.currentBalance",
      "tradeline.amountPastDue",
      "tradeline.highCredit",
      "tradeline.creditLimit",
      "tradeline.openedDate",
      "tradeline.dateClosed",
      "tradeline.dateOfFirstDelinquency",
      "tradeline.dateOfLastPayment",
      "tradeline.lastActivityDate",
      "tradeline.lastReportedDate",
      "tradeline.paymentPattern",
      "tradeline.mop",
      "tradeline.responsibilityCode",
      "tradeline.ecoaCode",
      "tradeline.terms",
      "tradeline.isCollectionAccount",
      "tradeline.originalCreditorName",
      "tradeline.collectionAgencyName",
      "creditor.name as creditorName"
    ])
    .executeTakeFirst();

  if (!tradelineRow) {
    throw new Error(`Tradeline ${tradelineId} not found`);
  }

  const result = await db
    .insertInto("tradelineSnapshot")
    .values({
      tradelineId,
      reportArtifactId: reportArtifactId ?? null,
      accountNumber: tradelineRow.accountNumber,
      accountType: tradelineRow.accountType,
      status: tradelineRow.status,
      balance: tradelineRow.balance,
      currentBalance: tradelineRow.currentBalance,
      amountPastDue: tradelineRow.amountPastDue,
      highCredit: tradelineRow.highCredit,
      creditLimit: tradelineRow.creditLimit,
      openedDate: tradelineRow.openedDate,
      dateClosed: tradelineRow.dateClosed,
      dateOfFirstDelinquency: tradelineRow.dateOfFirstDelinquency,
      dateOfLastPayment: tradelineRow.dateOfLastPayment,
      lastActivityDate: tradelineRow.lastActivityDate,
      lastReportedDate: tradelineRow.lastReportedDate,
      paymentPattern: tradelineRow.paymentPattern,
      mop: tradelineRow.mop,
      responsibilityCode: tradelineRow.responsibilityCode,
      ecoaCode: tradelineRow.ecoaCode,
      terms: tradelineRow.terms,
      isCollectionAccount: tradelineRow.isCollectionAccount,
      originalCreditorName: tradelineRow.originalCreditorName,
      collectionAgencyName: tradelineRow.collectionAgencyName,
      creditorName: tradelineRow.creditorName
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return result;
}

/**
 * Fetches the two most recent snapshots for a tradeline.
 * 
 * @param tradelineId The ID of the tradeline.
 * @returns An object containing the current and previous snapshots.
 */
export async function getLatestTwoSnapshots(tradelineId: number) {
  const snapshots = await db
    .selectFrom("tradelineSnapshot")
    .where("tradelineId", "=", tradelineId)
    .selectAll()
    .orderBy("snapshotAt", "desc")
    .limit(2)
    .execute();

  return {
    current: snapshots[0] || null,
    previous: snapshots[1] || null
  };
}

/**
 * Fetches a single snapshot by its ID.
 * 
 * @param snapshotId The ID of the snapshot.
 * @returns The snapshot record or null if not found.
 */
export async function getSnapshotById(snapshotId: number) {
  const snapshot = await db
    .selectFrom("tradelineSnapshot")
    .where("id", "=", snapshotId)
    .selectAll()
    .executeTakeFirst();
    
  return snapshot || null;
}

/**
 * Batch creates snapshots for multiple tradelines.
 * 
 * @param tradelineIds Array of tradeline IDs.
 * @param reportArtifactId Optional ID of the report artifact that triggered the update.
 * @returns A Map linking tradeline IDs to their new snapshot IDs.
 */
export async function createSnapshotsForBatch(tradelineIds: number[], reportArtifactId?: number) {
  const snapshotMap = new Map<number, number>();
  for (const id of tradelineIds) {
    try {
      const snap = await createSnapshot(id, reportArtifactId);
      snapshotMap.set(id, snap.id);
    } catch (e) {
      console.error(`Failed to create snapshot for tradeline ${id}`, e);
    }
  }
  return snapshotMap;
}

/**
 * Ensures at least one snapshot exists for a tradeline. If none exist,
 * creates an initial snapshot from the current state (for backward compatibility).
 * 
 * @param tradelineId The ID of the tradeline.
 * @returns The newly created snapshot or null if one already existed.
 */
export async function ensureInitialSnapshot(tradelineId: number) {
  const countRes = await db
    .selectFrom("tradelineSnapshot")
    .select(db.fn.count("id").as("count"))
    .where("tradelineId", "=", tradelineId)
    .executeTakeFirst();
    
  if (Number(countRes?.count || 0) === 0) {
    return createSnapshot(tradelineId);
  }
  return null;
}