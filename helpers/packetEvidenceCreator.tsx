import { db } from "./db";
import { chain } from "./hashChain";
import type { LetterContent } from "./pdfGenerator";
import type { ViolationDetails } from "./equifaxDisputeTemplate";
import type { TerminalLabelPhase } from "./terminalLabelProgression";

export interface PacketEvidenceCreatorParams {
  packetId: number;
  tradelineId: number | null;
  accountNumber?: string;
  consumerName: string;
  recipientName: string;
  letterContent: LetterContent;
  violationDetails?: ViolationDetails;
  terminalLabel: TerminalLabelPhase | null;
  now: Date;
}

export async function packetEvidenceCreator(
  params: PacketEvidenceCreatorParams
): Promise<number> {
  const {
    packetId,
    tradelineId,
    accountNumber,
    consumerName,
    recipientName,
    letterContent,
    violationDetails,
    terminalLabel,
    now,
  } = params;

  // 1. Create evidence event with hash chain for audit trail
  const eventType = "PACKET_GENERATED";
  const currentHash = chain(undefined, {
    packetId,
    eventType,
    at: now,
    letterContent,
    disputeVector: violationDetails?.disputeVector ?? null,
    accountNumber: accountNumber ?? null,
    statuteVersionId: null,
  });

  const evidenceEventResult = await db
    .insertInto("evidenceEvent")
    .values({
      packetId,
      eventType,
      at: now,
      region: "CA",
      previousHash: null,
      currentHash,
      description: `Dispute packet generated for tradeline account ${
        accountNumber ?? "unknown"
      } via direct creation flow. Consumer: ${consumerName}, Recipient: ${recipientName}`,
      statuteVersionId: null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  console.log(`Evidence event created for packet ${packetId}, hash: ${currentHash}`);

  // 2. If terminal label is Phase 4 (Procedural Exhaustion), insert an additional evidence event
  // Only insert if no TERMINAL_LABEL_REACHED event already exists for any packet on this tradeline
  if (terminalLabel === "PHASE 4: PROCEDURAL EXHAUSTION — PENDING") {
    const existingTerminalEvent = tradelineId
      ? await db
          .selectFrom("evidenceEvent")
          .innerJoin("packet", "packet.id", "evidenceEvent.packetId")
          .select("evidenceEvent.id")
          .where("evidenceEvent.eventType", "=", "TERMINAL_LABEL_REACHED")
          .where("packet.tradelineId", "=", tradelineId)
          .executeTakeFirst()
      : null;

    if (existingTerminalEvent) {
      console.log(
        `Skipping TERMINAL_LABEL_REACHED event for packet ${packetId} — event already exists for tradeline ${tradelineId} (existing event ID: ${existingTerminalEvent.id})`
      );
    } else {
      const terminalHash = chain(currentHash, {
        packetId,
        eventType: "TERMINAL_LABEL_REACHED",
        at: now,
        tradelineId: tradelineId ?? null,
      });

      await db
        .insertInto("evidenceEvent")
        .values({
          packetId,
          eventType: "TERMINAL_LABEL_REACHED",
          at: now,
          region: "CA",
          previousHash: currentHash,
          currentHash: terminalHash,
      description: `Phase 4: Procedural Exhaustion reached for tradeline ${
            tradelineId ?? "unknown"
          }`,
          statuteVersionId: null,
        })
        .execute();

      console.log(
        `Terminal label evidence event inserted for packet ${packetId}, tradeline ${
          tradelineId ?? "unknown"
        }`
      );
    }
  }

  // 3. Create compliance audit record
  await db
    .insertInto("packetComplianceAudit")
    .values({
      packetId,
      obligationId: null,
      statuteVersionId: null,
      appliedAt: now,
      evidenceEventId: evidenceEventResult.id,
      complianceStatus: "APPLIED",
      selectionReason: `Packet created via direct creation flow with bureau-specific template for ${recipientName}.`,
      regulationType: "BUREAU_TEMPLATE",
      region: "CA",
    })
    .execute();

  console.log(`Compliance audit recorded for packet ${packetId}`);

  return evidenceEventResult.id;
}