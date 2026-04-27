import { db } from "./db";

type RetentionSummary = {
  deletedPassExtractions: number;
  deletedBankruptcyRecords: number;
  deletedDiscriminationClaims: number;
  deletedObligationChallengeLogs: number;
  deletedTradelinePaymentHistories: number;
  deletedPacketComplianceAudits: number;
  deletedDeadlineEvents: number;
  deletedEvidenceAttachments: number;
  deletedSuccessMetrics: number;
  deletedMetro2Logs: number;
  deletedObligationInstances: number;
  deletedEvidenceEvents: number;
  deletedPackets: number;
  deletedCreditorObligationTests: number;
  deletedReportArtifacts: number;
  deletedTradelines: number;
  success: boolean;
  message?: string;
};

const getOneYearAgo = () => new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

/**
 * Previews the 1-year data retention policy deletion (dry run).
 * Returns the counts of what WOULD be deleted without actually deleting.
 */
export const previewRetention = async (): Promise<RetentionSummary> => {
  const oneYearAgo = getOneYearAgo();

  try {
    const [
      passExtractions,
      bankruptcyRecords,
      discriminationClaims,
      obligationChallengeLogs,
      tradelinePaymentHistories,
      packetComplianceAudits,
      deadlineEvents,
      evidenceAttachments,
      successMetrics,
      metro2Logs,
      obligationInstances,
      evidenceEvents,
      packets,
      creditorObligationTests,
      reportArtifacts,
      tradelines,
    ] = await Promise.all([
      db.selectFrom("passExtraction")
        .where("reportArtifactId", "in", db.selectFrom("reportArtifact").select("id").where("createdAt", "<", oneYearAgo))
        .select(({ fn }) => fn.count<number>("id").as("c"))
        .executeTakeFirst(),
      db.selectFrom("bankruptcyRecord")
        .where("tradelineId", "in", db.selectFrom("tradeline").select("id").where("createdAt", "<", oneYearAgo))
        .select(({ fn }) => fn.count<number>("id").as("c"))
        .executeTakeFirst(),
      db.selectFrom("discriminationClaim")
        .where("tradelineId", "in", db.selectFrom("tradeline").select("id").where("createdAt", "<", oneYearAgo))
        .select(({ fn }) => fn.count<number>("id").as("c"))
        .executeTakeFirst(),
      db.selectFrom("obligationChallengeLog")
        .where((eb) => eb.or([
          eb("tradelineId", "in", db.selectFrom("tradeline").select("id").where("createdAt", "<", oneYearAgo)),
          eb("reportArtifactId", "in", db.selectFrom("reportArtifact").select("id").where("createdAt", "<", oneYearAgo))
        ]))
        .select(({ fn }) => fn.count<number>("id").as("c"))
        .executeTakeFirst(),
      db.selectFrom("tradelinePaymentHistory")
        .where((eb) => eb.or([
          eb("tradelineId", "in", db.selectFrom("tradeline").select("id").where("createdAt", "<", oneYearAgo)),
          eb("reportArtifactId", "in", db.selectFrom("reportArtifact").select("id").where("createdAt", "<", oneYearAgo))
        ]))
        .select(({ fn }) => fn.count<number>("id").as("c"))
        .executeTakeFirst(),
      db.selectFrom("packetComplianceAudit").where("appliedAt", "<", oneYearAgo).select(({ fn }) => fn.count<number>("id").as("c")).executeTakeFirst(),
      db.selectFrom("deadlineEvent").where("createdAt", "<", oneYearAgo).select(({ fn }) => fn.count<number>("id").as("c")).executeTakeFirst(),
      db.selectFrom("evidenceAttachment").where("uploadedAt", "<", oneYearAgo).select(({ fn }) => fn.count<number>("id").as("c")).executeTakeFirst(),
      db.selectFrom("successMetric").where("recordedAt", "<", oneYearAgo).select(({ fn }) => fn.count<number>("id").as("c")).executeTakeFirst(),
      db.selectFrom("metro2ValidationLog").where("tradelineId", "in", db.selectFrom("tradeline").select("id").where("createdAt", "<", oneYearAgo)).select(({ fn }) => fn.count<number>("id").as("c")).executeTakeFirst(),
      db.selectFrom("obligationInstance").where("tradelineId", "in", db.selectFrom("tradeline").select("id").where("createdAt", "<", oneYearAgo)).select(({ fn }) => fn.count<number>("id").as("c")).executeTakeFirst(),
      db.selectFrom("evidenceEvent").where("at", "<", oneYearAgo).select(({ fn }) => fn.count<number>("id").as("c")).executeTakeFirst(),
      db.selectFrom("packet").where("createdAt", "<", oneYearAgo).select(({ fn }) => fn.count<number>("id").as("c")).executeTakeFirst(),
      db.selectFrom("creditorObligationTest").where("detectedAt", "<", oneYearAgo).select(({ fn }) => fn.count<number>("id").as("c")).executeTakeFirst(),
      db.selectFrom("reportArtifact").where("createdAt", "<", oneYearAgo).select(({ fn }) => fn.count<number>("id").as("c")).executeTakeFirst(),
      db.selectFrom("tradeline").where("createdAt", "<", oneYearAgo).select(({ fn }) => fn.count<number>("id").as("c")).executeTakeFirst(),
    ]);

    return {
      deletedPassExtractions: Number(passExtractions?.c || 0),
      deletedBankruptcyRecords: Number(bankruptcyRecords?.c || 0),
      deletedDiscriminationClaims: Number(discriminationClaims?.c || 0),
      deletedObligationChallengeLogs: Number(obligationChallengeLogs?.c || 0),
      deletedTradelinePaymentHistories: Number(tradelinePaymentHistories?.c || 0),
      deletedPacketComplianceAudits: Number(packetComplianceAudits?.c || 0),
      deletedDeadlineEvents: Number(deadlineEvents?.c || 0),
      deletedEvidenceAttachments: Number(evidenceAttachments?.c || 0),
      deletedSuccessMetrics: Number(successMetrics?.c || 0),
      deletedMetro2Logs: Number(metro2Logs?.c || 0),
      deletedObligationInstances: Number(obligationInstances?.c || 0),
      deletedEvidenceEvents: Number(evidenceEvents?.c || 0),
      deletedPackets: Number(packets?.c || 0),
      deletedCreditorObligationTests: Number(creditorObligationTests?.c || 0),
      deletedReportArtifacts: Number(reportArtifacts?.c || 0),
      deletedTradelines: Number(tradelines?.c || 0),
      success: true,
      message: "Retention preview completed successfully.",
    };
  } catch (error) {
    console.error("Error previewing data retention:", error);
    return {
      deletedPassExtractions: 0,
      deletedBankruptcyRecords: 0,
      deletedDiscriminationClaims: 0,
      deletedObligationChallengeLogs: 0,
      deletedTradelinePaymentHistories: 0,
      deletedPacketComplianceAudits: 0,
      deletedDeadlineEvents: 0,
      deletedEvidenceAttachments: 0,
      deletedSuccessMetrics: 0,
      deletedMetro2Logs: 0,
      deletedObligationInstances: 0,
      deletedEvidenceEvents: 0,
      deletedPackets: 0,
      deletedCreditorObligationTests: 0,
      deletedReportArtifacts: 0,
      deletedTradelines: 0,
      success: false,
      message: error instanceof Error ? error.message : "Unknown error during retention preview",
    };
  }
};

/**
 * Enforces the 1-year data retention policy for Credit Regulator Pro.
 * Deletes operational data older than 1 year in proper FK dependency order.
 * Does NOT delete audit logs or reference data.
 *
 * @param confirmDelete Safety flag. Must be true to execute deletions.
 */
export const enforceRetention = async (
  confirmDelete: boolean = false
): Promise<RetentionSummary> => {
  if (!confirmDelete) {
    return {
      deletedPassExtractions: 0,
      deletedBankruptcyRecords: 0,
      deletedDiscriminationClaims: 0,
      deletedObligationChallengeLogs: 0,
      deletedTradelinePaymentHistories: 0,
      deletedPacketComplianceAudits: 0,
      deletedDeadlineEvents: 0,
      deletedEvidenceAttachments: 0,
      deletedSuccessMetrics: 0,
      deletedMetro2Logs: 0,
      deletedObligationInstances: 0,
      deletedEvidenceEvents: 0,
      deletedPackets: 0,
      deletedCreditorObligationTests: 0,
      deletedReportArtifacts: 0,
      deletedTradelines: 0,
      success: false,
      message: "Retention enforcement skipped: confirmDelete flag is false.",
    };
  }

  const oneYearAgo = getOneYearAgo();

  try {
    return await db.transaction().execute(async (trx) => {
      // We execute deletions sequentially in proper FK dependency order
      
      // 1. passExtraction depends on reportArtifact
      const passExtractions = await trx.deleteFrom("passExtraction")
        .where("reportArtifactId", "in", trx.selectFrom("reportArtifact").select("id").where("createdAt", "<", oneYearAgo))
        .executeTakeFirst();
        
      const bankruptcyRecords = await trx.deleteFrom("bankruptcyRecord")
        .where("tradelineId", "in", trx.selectFrom("tradeline").select("id").where("createdAt", "<", oneYearAgo))
        .executeTakeFirst();

      const discriminationClaims = await trx.deleteFrom("discriminationClaim")
        .where("tradelineId", "in", trx.selectFrom("tradeline").select("id").where("createdAt", "<", oneYearAgo))
        .executeTakeFirst();

      const obligationChallengeLogs = await trx.deleteFrom("obligationChallengeLog")
        .where((eb) => eb.or([
          eb("tradelineId", "in", trx.selectFrom("tradeline").select("id").where("createdAt", "<", oneYearAgo)),
          eb("reportArtifactId", "in", trx.selectFrom("reportArtifact").select("id").where("createdAt", "<", oneYearAgo))
        ]))
        .executeTakeFirst();

      const tradelinePaymentHistories = await trx.deleteFrom("tradelinePaymentHistory")
        .where((eb) => eb.or([
          eb("tradelineId", "in", trx.selectFrom("tradeline").select("id").where("createdAt", "<", oneYearAgo)),
          eb("reportArtifactId", "in", trx.selectFrom("reportArtifact").select("id").where("createdAt", "<", oneYearAgo))
        ]))
        .executeTakeFirst();

      // 2. packetComplianceAudit depends on packet, evidenceEvent
      const packetComplianceAudits = await trx.deleteFrom("packetComplianceAudit")
        .where("appliedAt", "<", oneYearAgo)
        .executeTakeFirst();
        
      // 3. deadlineEvent depends on packet, obligationInstance
      const deadlineEvents = await trx.deleteFrom("deadlineEvent")
        .where("createdAt", "<", oneYearAgo)
        .executeTakeFirst();
        
      // 4. evidenceAttachment depends on packet, obligationInstance
      const evidenceAttachments = await trx.deleteFrom("evidenceAttachment")
        .where("uploadedAt", "<", oneYearAgo)
        .executeTakeFirst();
        
      // 5. successMetric depends on obligationInstance
      const successMetrics = await trx.deleteFrom("successMetric")
        .where("recordedAt", "<", oneYearAgo)
        .executeTakeFirst();
        
      // 6. metro2ValidationLog depends on tradeline
      const metro2Logs = await trx.deleteFrom("metro2ValidationLog")
        .where("tradelineId", "in", trx.selectFrom("tradeline").select("id").where("createdAt", "<", oneYearAgo))
        .executeTakeFirst();
        
      // 7. obligationInstance depends on tradeline
      const obligationInstances = await trx.deleteFrom("obligationInstance")
        .where("tradelineId", "in", trx.selectFrom("tradeline").select("id").where("createdAt", "<", oneYearAgo))
        .executeTakeFirst();
        
      // 8. evidenceEvent depends on packet
      const evidenceEvents = await trx.deleteFrom("evidenceEvent")
        .where("at", "<", oneYearAgo)
        .executeTakeFirst();
        
      // 9. packet depends on creditorObligationTest, tradeline
      const packets = await trx.deleteFrom("packet")
        .where("createdAt", "<", oneYearAgo)
        .executeTakeFirst();
        
      // 10. creditorObligationTest depends on tradeline
      const creditorObligationTests = await trx.deleteFrom("creditorObligationTest")
        .where("detectedAt", "<", oneYearAgo)
        .executeTakeFirst();
        
      // 11. reportArtifact depends on tradeline
      const reportArtifacts = await trx.deleteFrom("reportArtifact")
        .where("createdAt", "<", oneYearAgo)
        .executeTakeFirst();
        
      // 12. tradeline is safely deleted last
      const tradelines = await trx.deleteFrom("tradeline")
        .where("createdAt", "<", oneYearAgo)
        .executeTakeFirst();

      return {
        deletedPassExtractions: Number(passExtractions.numDeletedRows),
        deletedBankruptcyRecords: Number(bankruptcyRecords.numDeletedRows),
        deletedDiscriminationClaims: Number(discriminationClaims.numDeletedRows),
        deletedObligationChallengeLogs: Number(obligationChallengeLogs.numDeletedRows),
        deletedTradelinePaymentHistories: Number(tradelinePaymentHistories.numDeletedRows),
        deletedPacketComplianceAudits: Number(packetComplianceAudits.numDeletedRows),
        deletedDeadlineEvents: Number(deadlineEvents.numDeletedRows),
        deletedEvidenceAttachments: Number(evidenceAttachments.numDeletedRows),
        deletedSuccessMetrics: Number(successMetrics.numDeletedRows),
        deletedMetro2Logs: Number(metro2Logs.numDeletedRows),
        deletedObligationInstances: Number(obligationInstances.numDeletedRows),
        deletedEvidenceEvents: Number(evidenceEvents.numDeletedRows),
        deletedPackets: Number(packets.numDeletedRows),
        deletedCreditorObligationTests: Number(creditorObligationTests.numDeletedRows),
        deletedReportArtifacts: Number(reportArtifacts.numDeletedRows),
        deletedTradelines: Number(tradelines.numDeletedRows),
        success: true,
        message: "Retention enforcement completed successfully.",
      };
    });
  } catch (error) {
    console.error("Error enforcing data retention:", error);
    return {
      deletedPassExtractions: 0,
      deletedBankruptcyRecords: 0,
      deletedDiscriminationClaims: 0,
      deletedObligationChallengeLogs: 0,
      deletedTradelinePaymentHistories: 0,
      deletedPacketComplianceAudits: 0,
      deletedDeadlineEvents: 0,
      deletedEvidenceAttachments: 0,
      deletedSuccessMetrics: 0,
      deletedMetro2Logs: 0,
      deletedObligationInstances: 0,
      deletedEvidenceEvents: 0,
      deletedPackets: 0,
      deletedCreditorObligationTests: 0,
      deletedReportArtifacts: 0,
      deletedTradelines: 0,
      success: false,
      message: error instanceof Error ? error.message : "Unknown error during retention enforcement",
    };
  }
};