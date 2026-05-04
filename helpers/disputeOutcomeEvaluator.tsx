import { db } from "./db";
import type { DetectedChange } from "./changeDetector";
import { extractCanonicalStatus } from "./normalizeAccountData";

type AutoOutcome =
  | "WORKED"
  | "PARTIAL"
  | "FAILED_NO_ACTION"
  | "POSSIBLE_BUREAU_NON_COMPLIANCE";

type OutcomeSignals = {
  favorableCount: number;
  unfavorableCount: number;
  reasons: string[];
};

const NEGATIVE_STATUSES = [
  "COLLECTION",
  "CHARGE OFF",
  "BAD DEBT / CHARGE OFF",
  "DELINQUENT",
  "CONSUMER PROPOSAL",
  "REPOSSESSION",
];

const POSITIVE_STATUSES = ["PAID", "CURRENT", "SETTLED", "CLOSED"];

const parseNumber = (value: string | number | null): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const num =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(num) ? num : null;
};

const didImproveStatus = (
  oldValue: string | number | null,
  newValue: string | number | null
) => {
  const oldCanonical = extractCanonicalStatus(String(oldValue || ""));
  const newCanonical = extractCanonicalStatus(String(newValue || ""));

  const oldNegative = oldCanonical
    ? NEGATIVE_STATUSES.includes(oldCanonical)
    : false;
  const newNegative = newCanonical
    ? NEGATIVE_STATUSES.includes(newCanonical)
    : false;
  const oldPositive = oldCanonical
    ? POSITIVE_STATUSES.includes(oldCanonical)
    : false;
  const newPositive = newCanonical
    ? POSITIVE_STATUSES.includes(newCanonical)
    : false;

  if (oldNegative && (newPositive || !newNegative)) return true;
  return false;
};

const didWorsenStatus = (
  oldValue: string | number | null,
  newValue: string | number | null
) => {
  const oldCanonical = extractCanonicalStatus(String(oldValue || ""));
  const newCanonical = extractCanonicalStatus(String(newValue || ""));

  const oldNegative = oldCanonical
    ? NEGATIVE_STATUSES.includes(oldCanonical)
    : false;
  const newNegative = newCanonical
    ? NEGATIVE_STATUSES.includes(newCanonical)
    : false;
  const oldPositive = oldCanonical
    ? POSITIVE_STATUSES.includes(oldCanonical)
    : false;
  const newPositive = newCanonical
    ? POSITIVE_STATUSES.includes(newCanonical)
    : false;

  if (!oldNegative && newNegative) return true;
  if (oldPositive && !newPositive && newNegative) return true;
  return false;
};

function deriveOutcomeSignals(changes: DetectedChange[]): OutcomeSignals {
  const signals: OutcomeSignals = {
    favorableCount: 0,
    unfavorableCount: 0,
    reasons: [],
  };

  for (const change of changes) {
    const field = change.fieldName;
    const oldValue = change.oldValue;
    const newValue = change.newValue;

    if (
      field === "balance" ||
      field === "currentBalance" ||
      field === "amountPastDue"
    ) {
      const oldNum = parseNumber(oldValue);
      const newNum = parseNumber(newValue);
      if (oldNum !== null && newNum !== null) {
        if (newNum < oldNum) {
          signals.favorableCount += 1;
          signals.reasons.push(`${field} decreased`);
        } else if (newNum > oldNum) {
          signals.unfavorableCount += 1;
          signals.reasons.push(`${field} increased`);
        }
      }
      continue;
    }

    if (field === "status") {
      if (didImproveStatus(oldValue, newValue)) {
        signals.favorableCount += 1;
        signals.reasons.push("status improved");
      } else if (didWorsenStatus(oldValue, newValue)) {
        signals.unfavorableCount += 1;
        signals.reasons.push("status worsened");
      }
      continue;
    }

    if (field === "dateOfFirstDelinquency") {
      if (oldValue && !newValue) {
        signals.favorableCount += 1;
        signals.reasons.push("DOFD removed");
      } else if (!oldValue && newValue) {
        signals.unfavorableCount += 1;
        signals.reasons.push("DOFD added");
      }
      continue;
    }

    if (field === "isCollectionAccount") {
      const oldBool = String(oldValue || "").toLowerCase() === "true";
      const newBool = String(newValue || "").toLowerCase() === "true";
      if (oldBool && !newBool) {
        signals.favorableCount += 1;
        signals.reasons.push("collection flag removed");
      } else if (!oldBool && newBool) {
        signals.unfavorableCount += 1;
        signals.reasons.push("collection flag added");
      }
    }
  }

  return signals;
}

function classifyOutcome(params: {
  signals: OutcomeSignals;
  deadlinePassed: boolean;
  responseReceived: boolean;
}): AutoOutcome | null {
  const { signals, deadlinePassed, responseReceived } = params;
  if (signals.favorableCount > 0 && signals.unfavorableCount === 0) {
    return "WORKED";
  }
  if (signals.favorableCount > 0 && signals.unfavorableCount > 0) {
    return "PARTIAL";
  }
  if (signals.favorableCount === 0 && responseReceived) {
    return "FAILED_NO_ACTION";
  }
  if (signals.favorableCount === 0 && deadlinePassed) {
    return "POSSIBLE_BUREAU_NON_COMPLIANCE";
  }
  return null;
}

function resolveNextState(outcome: AutoOutcome, responseReceived: boolean) {
  if (outcome === "WORKED") return "ADDRESSED_VIA_LINKED_DISPUTE";
  if (outcome === "PARTIAL") return "INSUFFICIENT_RESPONSE";
  if (outcome === "FAILED_NO_ACTION") return "INSUFFICIENT_RESPONSE";
  if (!responseReceived) return "NO_RESPONSE";
  return "INSUFFICIENT_RESPONSE";
}

export async function evaluateDisputeOutcomesForTradeline(params: {
  tradelineId: number;
  userId: number;
  reportArtifactId: number;
  changes: DetectedChange[];
  evaluatedAt?: Date;
}) {
  const evaluatedAt = params.evaluatedAt ?? new Date();
  const activeInstances = await db
    .selectFrom("obligationInstance")
    .select([
      "id",
      "disputeVector",
      "responseDeadline",
      "responseReceivedDate",
      "successOutcome",
      "state",
    ])
    .where("tradelineId", "=", params.tradelineId)
    .where("userId", "=", params.userId)
    .where("challengeSentDate", "is not", null)
    .where("state", "in", ["CHALLENGED", "NO_RESPONSE", "INSUFFICIENT_RESPONSE"])
    .execute();

  if (activeInstances.length === 0) {
    return { evaluatedCount: 0 };
  }

  const tradeline = await db
    .selectFrom("tradeline")
    .select(["bureauId", "creditorId"])
    .where("id", "=", params.tradelineId)
    .executeTakeFirst();

  const latestPacket = await db
    .selectFrom("packet")
    .select(["id", "successOutcome"])
    .where("tradelineId", "=", params.tradelineId)
    .where("sentDate", "is not", null)
    .orderBy("sentDate", "desc")
    .limit(1)
    .executeTakeFirst();

  const signals = deriveOutcomeSignals(params.changes);
  let evaluatedCount = 0;

  for (const instance of activeInstances) {
    const deadlinePassed = instance.responseDeadline
      ? new Date(instance.responseDeadline).getTime() <= evaluatedAt.getTime()
      : false;
    const responseReceived = Boolean(instance.responseReceivedDate);
    const outcome = classifyOutcome({
      signals,
      deadlinePassed,
      responseReceived,
    });

    if (!outcome) {
      continue;
    }

    const hasSameOutcome = instance.successOutcome === outcome;
    const metricAlreadyExists = await db
      .selectFrom("successMetric")
      .select("id")
      .where("obligationInstanceId", "=", instance.id)
      .where("outcome", "=", outcome)
      .executeTakeFirst();

    const evidenceReason =
      signals.reasons.length > 0
        ? signals.reasons.join(", ")
        : "no favorable changes detected";

    if (!hasSameOutcome) {
      await db
        .updateTable("obligationInstance")
        .set({
          successOutcome: outcome,
          responseStatus: `AUTO_EVALUATED_${outcome}`,
          state: resolveNextState(outcome, responseReceived),
        })
        .where("id", "=", instance.id)
        .execute();
    }

    if (!metricAlreadyExists) {
      await db
        .insertInto("successMetric")
        .values({
          obligationInstanceId: instance.id,
          outcome,
          disputeVector: instance.disputeVector,
          bureauId: tradeline?.bureauId ?? null,
          creditorId: tradeline?.creditorId ?? null,
          region: "CA",
          recordedAt: evaluatedAt,
          responseTimeDays: null,
        })
        .execute();
    }

    await db
      .insertInto("evidenceEvent")
      .values({
        packetId: latestPacket?.id ?? null,
        eventType: "DISPUTE_OUTCOME_AUTO_EVALUATED",
        description: `Obligation ${instance.id} auto-evaluated as ${outcome} after report artifact ${params.reportArtifactId}; signals: ${evidenceReason}.`,
        region: "CA",
        at: evaluatedAt,
      })
      .execute();

    if (latestPacket && latestPacket.successOutcome !== outcome) {
      await db
        .updateTable("packet")
        .set({ successOutcome: outcome })
        .where("id", "=", latestPacket.id)
        .execute();
    }

    evaluatedCount += 1;
  }

  return { evaluatedCount };
}
