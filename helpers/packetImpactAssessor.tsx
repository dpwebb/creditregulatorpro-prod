import { db } from "./db";
import { getSnapshotById } from "./tradelineSnapshotManager";
import type { Json } from "./schema";
import { extractCanonicalStatus } from "./normalizeAccountData";

/**
 * Assesses the impact of a packet by comparing its baseline snapshot to a follow-up snapshot.
 * 
 * @param packetId The ID of the packet to assess.
 * @param followupSnapshotId The ID of the follow-up snapshot.
 * @returns The newly created packetImpactAssessment record.
 */
export async function assessPacketImpact(packetId: number, followupSnapshotId: number) {
  const packet = await db
    .selectFrom("packet")
    .where("id", "=", packetId)
    .selectAll()
    .executeTakeFirstOrThrow();

  if (!packet.baselineSnapshotId) {
    throw new Error(`Packet ${packetId} has no baseline snapshot configured.`);
  }

  const baseline = await getSnapshotById(packet.baselineSnapshotId);
  const followup = await getSnapshotById(followupSnapshotId);

  if (!baseline || !followup) {
    throw new Error("Missing baseline or follow-up snapshots for comparison.");
  }

  const diffs: Record<string, any>[] = [];
  let favorableCount = 0;
  let unfavorableCount = 0;
  let neutralCount = 0;

  const compareField = (name: string, oldV: any, newV: any, type: string) => {
    // Normalize values for comparison
    const oldStr = oldV instanceof Date ? oldV.getTime().toString() : String(oldV ?? "");
    const newStr = newV instanceof Date ? newV.getTime().toString() : String(newV ?? "");

    if (oldStr !== newStr) {
      let isFavorable = false;
      let isUnfavorable = false;

      // Evaluate Financials
      if (name === "balance" || name === "currentBalance" || name === "amountPastDue") {
        const o = Number(oldV || 0);
        const n = Number(newV || 0);
        if (n < o) isFavorable = true;
        else if (n > o) isUnfavorable = true;
      } 
      // Evaluate Status
      else if (name === "status") {
        const oldCanon = extractCanonicalStatus(String(oldV || "")) || String(oldV || "").toUpperCase();
        const newCanon = extractCanonicalStatus(String(newV || "")) || String(newV || "").toUpperCase();

        if (oldCanon !== newCanon) {
          const derogs = ["COLLECTION", "CHARGE", "BAD DEBT", "PAST DUE", "LATE", "DELINQUENT", "CONSUMER PROPOSAL", "REPOSSESSION"];
          const oldDerog = derogs.some(d => oldCanon.includes(d));
          const newDerog = derogs.some(d => newCanon.includes(d));
          
          if (oldDerog && !newDerog) isFavorable = true;
          else if (!oldDerog && newDerog) isUnfavorable = true;
        }
      } 
      // Evaluate DOFD
      else if (name === "dateOfFirstDelinquency") {
        if (oldV && !newV) isFavorable = true;
        if (!oldV && newV) isUnfavorable = true;
      } 
      // Evaluate Collection Account Flag
      else if (name === "isCollectionAccount") {
        if (oldV === true && newV === false) isFavorable = true;
        if (oldV === false && newV === true) isUnfavorable = true;
      }

      diffs.push({
        fieldName: name,
        oldValue: oldV,
        newValue: newV,
        changeType: type,
        isFavorable
      });

      if (isFavorable) favorableCount++;
      else if (isUnfavorable) unfavorableCount++;
      else neutralCount++;
    }
  };

  compareField("balance", baseline.balance, followup.balance, "FINANCIAL");
  compareField("currentBalance", baseline.currentBalance, followup.currentBalance, "FINANCIAL");
  compareField("amountPastDue", baseline.amountPastDue, followup.amountPastDue, "FINANCIAL");
  compareField("highCredit", baseline.highCredit, followup.highCredit, "FINANCIAL");
  compareField("creditLimit", baseline.creditLimit, followup.creditLimit, "FINANCIAL");

  compareField("openedDate", baseline.openedDate, followup.openedDate, "TEMPORAL");
  compareField("dateClosed", baseline.dateClosed, followup.dateClosed, "TEMPORAL");
  compareField("dateOfFirstDelinquency", baseline.dateOfFirstDelinquency, followup.dateOfFirstDelinquency, "TEMPORAL");
  compareField("dateOfLastPayment", baseline.dateOfLastPayment, followup.dateOfLastPayment, "TEMPORAL");
  compareField("lastActivityDate", baseline.lastActivityDate, followup.lastActivityDate, "TEMPORAL");
  compareField("lastReportedDate", baseline.lastReportedDate, followup.lastReportedDate, "TEMPORAL");

  compareField("status", baseline.status, followup.status, "STATUS");

  compareField("accountNumber", baseline.accountNumber, followup.accountNumber, "IDENTITY");
  compareField("creditorName", baseline.creditorName, followup.creditorName, "IDENTITY");
  compareField("originalCreditorName", baseline.originalCreditorName, followup.originalCreditorName, "IDENTITY");
  compareField("collectionAgencyName", baseline.collectionAgencyName, followup.collectionAgencyName, "IDENTITY");

  compareField("paymentPattern", baseline.paymentPattern, followup.paymentPattern, "PAYMENT");
  compareField("mop", baseline.mop, followup.mop, "PAYMENT");
  compareField("terms", baseline.terms, followup.terms, "PAYMENT");

  compareField("isCollectionAccount", baseline.isCollectionAccount, followup.isCollectionAccount, "COLLECTION");

  // Calculate score between -100 and +100
  let score = (favorableCount * 30) - (unfavorableCount * 30);
  if (score > 100) score = 100;
  if (score < -100) score = -100;

  const result = await db
    .insertInto("packetImpactAssessment")
    .values({
      packetId,
      tradelineId: baseline.tradelineId,
      baselineSnapshotId: baseline.id,
      followupSnapshotId: followup.id,
      assessmentType: "SNAPSHOT_COMPARISON",
      favorableChanges: favorableCount,
      unfavorableChanges: unfavorableCount,
      neutralChanges: neutralCount,
      totalFieldsChanged: diffs.length,
      fieldDiffs: JSON.stringify(diffs) as unknown as Json,
      impactScore: score.toString()
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return result;
}

/**
 * Evaluates pending impacts for a given tradeline and new snapshot.
 * 
 * @param tradelineId The ID of the tradeline being updated.
 * @param newSnapshotId The ID of the latest snapshot representing current state.
 * @returns Array of packetImpactAssessment records created.
 */
export async function assessPendingPacketImpacts(tradelineId: number, newSnapshotId: number) {
  const packets = await db
    .selectFrom("packet")
    .leftJoin("packetImpactAssessment", "packetImpactAssessment.packetId", "packet.id")
    .where("packet.tradelineId", "=", tradelineId)
    .where("packet.baselineSnapshotId", "is not", null)
    .where("packetImpactAssessment.id", "is", null)
    .select(["packet.id"])
    .execute();

  const results = [];
  for (const p of packets) {
    try {
      results.push(await assessPacketImpact(p.id, newSnapshotId));
    } catch (e) {
      console.error(`Failed to assess pending impact for packet ${p.id}`, e);
    }
  }
  return results;
}

/**
 * Retrieves an existing impact assessment for a packet.
 * 
 * @param packetId The ID of the packet.
 * @returns The packetImpactAssessment record or null if not found.
 */
export async function getPacketImpact(packetId: number) {
  const assessment = await db
    .selectFrom("packetImpactAssessment")
    .where("packetId", "=", packetId)
    .selectAll()
    .executeTakeFirst();

  return assessment || null;
}