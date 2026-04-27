import { db } from "./db";

/**
 * Fetches all data needed to generate a comprehensive evidence package.
 */
export const fetchEvidencePackageData = async (obligationInstanceId: number) => {
  // Fetch main obligation details
  const obligation = await db
    .selectFrom("obligationInstance")
    .innerJoin("tradeline", "obligationInstance.tradelineId", "tradeline.id")
    .leftJoin("creditor", "tradeline.creditorId", "creditor.id")
    .leftJoin("bureau", "tradeline.bureauId", "bureau.id")
    .where("obligationInstance.id", "=", obligationInstanceId)
    .select([
      "obligationInstance.id",
      "obligationInstance.disputeVector",
      "obligationInstance.createdAt",
      "obligationInstance.state",
      "obligationInstance.challengeSentDate",
      "obligationInstance.responseDeadline",
      "obligationInstance.responseReceivedDate",
      "obligationInstance.responseStatus",
      "obligationInstance.escalationTriggered",
      "obligationInstance.escalationDate",
      "tradeline.accountNumber",
      "tradeline.id as tradelineId",
      "creditor.name as creditorName",
      "creditor.id as creditorId",
      "bureau.name as bureauName",
    ])
    .executeTakeFirstOrThrow();

  // Fetch all packets for this obligation
  const packets = await db
    .selectFrom("packet")
    .where("tradelineId", "=", obligation.tradelineId)
    .leftJoin("statuteVersion", "packet.statuteVersionId", "statuteVersion.id")
    .leftJoin("statute", "statuteVersion.statuteId", "statute.id")
    .select([
      "packet.id",
      "packet.type",
      "packet.createdAt",
      "packet.status",
      "packet.bureauResponseDate",
      "packet.responseType",
      "packet.terminalLabel",
      "statute.code as statuteCode",
      "statute.jurisdiction",
      "statuteVersion.sectionReference",
    ])
    .orderBy("packet.createdAt", "asc")
    .execute();

  // Fetch audit logs for this obligation
  const auditLogs = await db
    .selectFrom("auditLog")
    .where("entityType", "=", "OBLIGATION_INSTANCE")
    .where("entityId", "=", obligationInstanceId)
    .orderBy("timestamp", "asc")
    .selectAll()
    .execute();

  // Fetch evidence attachments
  const attachments = await db
    .selectFrom("evidenceAttachment")
    .where("obligationInstanceId", "=", obligationInstanceId)
    .selectAll()
    .execute();

  // Fetch evidence events (chain with hashes)
  const evidenceEvents = await db
    .selectFrom("evidenceEvent")
    .leftJoin("packet", "evidenceEvent.packetId", "packet.id")
    .where("packet.tradelineId", "=", obligation.tradelineId)
    .select([
      "evidenceEvent.id",
      "evidenceEvent.eventType",
      "evidenceEvent.at",
      "evidenceEvent.description",
      "evidenceEvent.currentHash",
      "evidenceEvent.previousHash",
      "evidenceEvent.packetId",
    ])
    .orderBy("evidenceEvent.at", "asc")
    .execute();

  // Fetch all unique statutes referenced
  const statuteIds = packets
    .map((p) => p.statuteCode)
    .filter((code): code is string => code != null);

  const statutes = statuteIds.length > 0
    ? await db
        .selectFrom("statute")
        .innerJoin("statuteVersion", "statute.id", "statuteVersion.statuteId")
        .where("statute.code", "in", statuteIds)
        .where((eb) =>
          eb.or([
            eb("statuteVersion.supersededDate", "is", null),
            eb("statuteVersion.supersededDate", ">", new Date()),
          ])
        )
        .select([
          "statute.code",
          "statute.jurisdiction",
          "statuteVersion.sectionReference",
          "statuteVersion.description",
          "statuteVersion.effectiveDate",
          "statuteVersion.sourceUrl",
          "statuteVersion.responseClockDays",
        ])
        .execute()
    : [];

  // Count escalations
  const escalationCount = auditLogs.filter(
    (log) => log.actionType === "ESCALATION_TRIGGERED"
  ).length;

  // Calculate days since initial challenge
  const daysSinceChallenge = obligation.challengeSentDate
    ? Math.floor(
        (new Date().getTime() - new Date(obligation.challengeSentDate).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : 0;

  // Get creditor compliance record (success metrics)
  const creditorMetrics = obligation.creditorId
    ? await db
        .selectFrom("successMetric")
        .where("creditorId", "=", obligation.creditorId)
        .select([
          "outcome",
          "responseTimeDays",
          "escalationCount",
          "finalState",
        ])
        .execute()
    : [];

  return {
    obligation,
    packets,
    auditLogs,
    attachments,
    evidenceEvents,
    statutes,
    escalationCount,
    daysSinceChallenge,
    creditorMetrics,
  };
};

export type EvidencePackageData = Awaited<ReturnType<typeof fetchEvidencePackageData>>;