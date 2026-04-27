import { db } from "./db";
import { extractCanonicalStatus } from "./normalizeAccountData";

export type SnapshotData = {
  tradelineId: number;
  accountNumber: string;
  status: string | null;
  balance: number | null;
  currentBalance: number | null;
  amountPastDue: number | null;
  dateOfFirstDelinquency: Date | null;
  lastActivityDate: Date | null;
  lastReportedDate: Date | null;
  creditLimit: number | null;
  highCredit: number | null;
  openedDate: Date | null;
  dateClosed: Date | null;
  paymentPattern: string | null;
  disputeInstanceIds: number[];
};

/**
 * Snapshots the current state of all tradelines for a user that have an active,
 * unresolved dispute. This should be called BEFORE persisting new report data
 * to establish a baseline for comparison.
 */
export async function snapshotDisputedTradelines(
  userId: number
): Promise<Map<number, SnapshotData>> {
  const rows = await db
    .selectFrom("obligationInstance")
    .innerJoin("tradeline", "obligationInstance.tradelineId", "tradeline.id")
    .where("obligationInstance.userId", "=", userId)
    .where("obligationInstance.challengeSentDate", "is not", null)
    .where("obligationInstance.responseReceivedDate", "is", null)
    .where("obligationInstance.state", "in", ["CHALLENGED", "NO_RESPONSE"])
    .select([
      "tradeline.id as tradelineId",
      "tradeline.accountNumber",
      "tradeline.status",
      "tradeline.balance",
      "tradeline.currentBalance",
      "tradeline.amountPastDue",
      "tradeline.dateOfFirstDelinquency",
      "tradeline.lastActivityDate",
      "tradeline.lastReportedDate",
      "tradeline.creditLimit",
      "tradeline.highCredit",
      "tradeline.openedDate",
      "tradeline.dateClosed",
      "tradeline.paymentPattern",
      "obligationInstance.id as instanceId",
    ])
    .execute();

  const map = new Map<number, SnapshotData>();

  for (const row of rows) {
    if (!map.has(row.tradelineId)) {
      map.set(row.tradelineId, {
        tradelineId: row.tradelineId,
        accountNumber: row.accountNumber,
        status: row.status,
        balance: row.balance ? Number(row.balance) : null,
        currentBalance: row.currentBalance ? Number(row.currentBalance) : null,
        amountPastDue: row.amountPastDue ? Number(row.amountPastDue) : null,
        dateOfFirstDelinquency: row.dateOfFirstDelinquency
          ? new Date(row.dateOfFirstDelinquency)
          : null,
        lastActivityDate: row.lastActivityDate
          ? new Date(row.lastActivityDate)
          : null,
        lastReportedDate: row.lastReportedDate
          ? new Date(row.lastReportedDate)
          : null,
        creditLimit: row.creditLimit ? Number(row.creditLimit) : null,
        highCredit: row.highCredit ? Number(row.highCredit) : null,
        openedDate: row.openedDate ? new Date(row.openedDate) : null,
        dateClosed: row.dateClosed ? new Date(row.dateClosed) : null,
        paymentPattern: row.paymentPattern,
        disputeInstanceIds: [],
      });
    }
    map.get(row.tradelineId)!.disputeInstanceIds.push(row.instanceId);
  }

  return map;
}

/**
 * Compares the previously snapshotted tradelines against their new state (after
 * ingestion of a new report) to detect unnotified corrections or deletions.
 * When found, it automatically resolves associated obligations, records success metrics,
 * and leaves an evidence trail.
 */
export async function detectAndRecordSilentCorrections(
  userId: number,
  preSnapshots: Map<number, SnapshotData>,
  newTradelineIds: number[]
) {
  const corrections: {
    tradelineId: number;
    type: "SILENT_CORRECTION" | "SILENT_DELETION";
    changes: string[];
    instanceIds: number[];
  }[] = [];

  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const formatSafe = (d: Date | string | null | undefined) => {
    if (!d) return "N/A";
    try {
      return dateFormatter.format(new Date(d));
    } catch {
      return String(d);
    }
  };

  const currencyFormatter = new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  });

  const formatCurrency = (amount: number) => currencyFormatter.format(amount);

  for (const [tradelineId, snapshot] of preSnapshots.entries()) {
    const current = await db
      .selectFrom("tradeline")
      .where("id", "=", tradelineId)
      .selectAll()
      .executeTakeFirst();

    let isCorrection = false;
    let type: "SILENT_CORRECTION" | "SILENT_DELETION" = "SILENT_CORRECTION";
    const changes: string[] = [];

    // Case 1: The tradeline was NOT updated by the new report
    if (!newTradelineIds.includes(tradelineId)) {
      if (current) {
        // If it's still in the DB but wasn't updated, check for removal indicators
        const statusCleared = current.status === null && snapshot.status !== null;
        const currentBal = Number(current.balance ?? current.currentBalance ?? 0);
        const snapshotBal = Number(
          snapshot.balance ?? snapshot.currentBalance ?? 0
        );
        const balanceZeroed = currentBal === 0 && snapshotBal > 0;

        if (statusCleared || balanceZeroed) {
          isCorrection = true;
          type = "SILENT_DELETION";
          if (statusCleared) {
            changes.push(`Status cleared (was '${snapshot.status}')`);
          }
          if (balanceZeroed) {
            changes.push(`Balance zeroed (was ${formatCurrency(snapshotBal)})`);
          }
        }
      } else {
        // Highly unusual: Record was physically deleted from the database
        isCorrection = true;
        type = "SILENT_DELETION";
        changes.push("Tradeline record removed from database entirely");
      }
    } 
    // Case 2: The tradeline WAS matched and updated in the new report
    else {
      if (current) {
        // Check for meaningful financial correction (balance dropped significantly)
        const oldBalance = Number(
          snapshot.balance ?? snapshot.currentBalance ?? 0
        );
        const newBalance = Number(current.balance ?? current.currentBalance ?? 0);
        if (oldBalance > 0 && newBalance < oldBalance) {
          const decreasePercent = (oldBalance - newBalance) / oldBalance;
          if (decreasePercent > 0.1) {
            changes.push(
              `Balance decreased by >10% from ${formatCurrency(
                oldBalance
              )} to ${formatCurrency(newBalance)}`
            );
          }
        }

        // Check for status correction (from derogatory to positive)
        const oldCanonical = snapshot.status ? extractCanonicalStatus(snapshot.status) : null;
        const newCanonical = current.status ? extractCanonicalStatus(current.status) : null;

        const negativeCanonical = [
          "COLLECTION",
          "CHARGE OFF",
          "BAD DEBT / CHARGE OFF",
          "DELINQUENT",
          "CONSUMER PROPOSAL",
          "REPOSSESSION",
        ];
        const positiveCanonical = [
          "PAID",
          "CURRENT",
          "SETTLED",
          "CLOSED",
        ];

        const wasNegative = oldCanonical ? negativeCanonical.includes(oldCanonical) : false;
        const isNowPositive =
          (newCanonical && positiveCanonical.includes(newCanonical)) ||
          (newCanonical ? !negativeCanonical.includes(newCanonical) : true);

        if (wasNegative && isNowPositive && oldCanonical !== newCanonical) {
          changes.push(
            `Status improved from '${snapshot.status}' to '${current.status}'`
          );
        }

        // Check for dates correction (DOFD removed or modified)
        const snapshotDofd = snapshot.dateOfFirstDelinquency
          ? new Date(snapshot.dateOfFirstDelinquency)
          : null;
        const currentDofd = current.dateOfFirstDelinquency
          ? new Date(current.dateOfFirstDelinquency)
          : null;

        if (snapshotDofd && !currentDofd) {
          changes.push(`Date of first delinquency removed`);
        } else if (
          snapshotDofd &&
          currentDofd &&
          snapshotDofd.getTime() !== currentDofd.getTime()
        ) {
          changes.push(
            `Date of first delinquency changed from ${formatSafe(
              snapshotDofd
            )} to ${formatSafe(currentDofd)}`
          );
        }

        // Check for amount past due correction
        const oldPastDue = Number(snapshot.amountPastDue ?? 0);
        const newPastDue = Number(current.amountPastDue ?? 0);
        if (oldPastDue > 0 && newPastDue === 0) {
          changes.push(
            `Amount past due zeroed (was ${formatCurrency(oldPastDue)})`
          );
        }

        // If any positive change threshold was met, flag it
        if (changes.length > 0) {
          isCorrection = true;
          type = "SILENT_CORRECTION";
        }
      }
    }

    if (isCorrection) {
      corrections.push({
        tradelineId,
        type,
        changes,
        instanceIds: snapshot.disputeInstanceIds,
      });

      if (snapshot.disputeInstanceIds.length > 0) {
        const relatedPacket = await db
          .selectFrom("packet")
          .select(["id"])
          .where("tradelineId", "=", tradelineId)
          .where("status", "in", ["GENERATED", "SENT"])
          .orderBy("createdAt", "desc")
          .limit(1)
          .executeTakeFirst();

        // A. Resolve the obligation instances — move to terminal state
        await db
          .updateTable("obligationInstance")
          .set({
            state: "PROCEDURALLY_EXHAUSTED",
            successOutcome: type,
            responseStatus: "NO_RESPONSE_CORRECTION_DETECTED",
          })
          .where("id", "in", snapshot.disputeInstanceIds)
          .execute();

        for (const instanceId of snapshot.disputeInstanceIds) {
          const inst = await db
            .selectFrom("obligationInstance")
            .where("id", "=", instanceId)
            .select(["disputeVector"])
            .executeTakeFirst();

          if (inst) {
            // B. Push a success metric reflecting the unnotified fix
            await db
              .insertInto("successMetric")
              .values({
                obligationInstanceId: instanceId,
                outcome: type,
                disputeVector: inst.disputeVector,
                bureauId: current?.bureauId ?? null,
                creditorId: current?.creditorId ?? null,
                region: "CA",
                recordedAt: new Date(),
              })
              .execute();
          }

          // C. Record this detection in the evidence stream
          await db
            .insertInto("evidenceEvent")
            .values({
              eventType:
                type === "SILENT_CORRECTION"
                  ? "SILENT_CORRECTION_DETECTED"
                  : "SILENT_DELETION_DETECTED",
              description: `Account ${snapshot.accountNumber}: ${changes.join(
                "; "
              )}`,
              region: "CA",
              at: new Date(),
              packetId: relatedPacket?.id ?? null,
            })
            .execute();

          if (relatedPacket) {
            await db
              .insertInto("evidenceEvent")
              .values({
                eventType: "DRIFT_DETECTED_POST_DISPUTE",
                description: `Drift detected on account ${
                  snapshot.accountNumber
                } after packet ${relatedPacket.id}: ${changes.join("; ")}`,
                region: "CA",
                at: new Date(),
                packetId: relatedPacket.id,
              })
              .execute();
          }
        }
      }

      console.log(
        `[SilentCorrections] Detected ${type} for Tradeline ${tradelineId}: ${changes.join(
          "; "
        )}`
      );
    }
  }

  return {
    corrections,
    totalDetected: corrections.length,
  };
}