import { db } from "./db";
import { Transaction } from "kysely";
import { DB } from "./schema";
import { logDelete, logAudit } from "./auditLogger";

/**
 * Cascade delete all data associated with a report artifact.
 * This function deletes all downstream records in the correct order to respect foreign key constraints.
 * 
 * @param reportArtifactId The ID of the report artifact to delete
 * @param userId The ID of the user performing the deletion (for audit logging)
 * @param request Optional request object for audit logging
 */
export async function deleteReportArtifactCascade(
  reportArtifactId: number,
  userId: number,
  request?: Request
): Promise<void> {
  console.log(`Starting cascade delete for report artifact ${reportArtifactId}`);

  await db.transaction().execute(async (trx: Transaction<DB>) => {
    // Step 1: Get the report artifact to extract tradeline IDs
    const reportArtifact = await trx
      .selectFrom("reportArtifact")
      .select(["id", "data", "userId", "organizationId"])
      .where("id", "=", reportArtifactId)
      .executeTakeFirst();

    if (!reportArtifact) {
      throw new Error(`Report artifact ${reportArtifactId} not found`);
    }

    console.log(`Found report artifact ${reportArtifactId}`, {
      userId: reportArtifact.userId,
      organizationId: reportArtifact.organizationId,
    });

    // Query tradelines directly by report_artifact_id
    const tradelines = await trx
      .selectFrom("tradeline")
      .select("id")
      .where("reportArtifactId", "=", reportArtifactId)
      .execute();
    
    const tradelineIds = tradelines.map((t) => t.id);
    console.log(`Found ${tradelineIds.length} tradelines to delete:`, tradelineIds);

    // Step 2: For each tradeline, delete all child records in the correct order
    // Note: We don't delete the tradeline itself - the CASCADE will do that when we delete the report artifact
    for (const tradelineId of tradelineIds) {
      console.log(`Processing tradeline ${tradelineId}`);
      await deleteTradeline(trx, tradelineId, userId, reportArtifactId, true);
    }

    // Catch-all: Delete any remaining tradeline_snapshots for this report artifact
    const orphanSnapshots = await trx
      .selectFrom("tradelineSnapshot")
      .select("id")
      .where("reportArtifactId", "=", reportArtifactId)
      .execute();
    
    const orphanSnapshotIds = orphanSnapshots.map((s) => s.id);
    
    if (orphanSnapshotIds.length > 0) {
      console.log(`Found ${orphanSnapshotIds.length} orphaned tradeline snapshots for report artifact ${reportArtifactId}`);

      await trx
        .deleteFrom("packetImpactAssessment")
        .where((eb) => eb.or([
          eb("baselineSnapshotId", "in", orphanSnapshotIds),
          eb("followupSnapshotId", "in", orphanSnapshotIds)
        ]))
        .executeTakeFirst();

      await trx
        .updateTable("obligationChallengeLog")
        .set({ sourceSnapshotId: null })
        .where("sourceSnapshotId", "in", orphanSnapshotIds)
        .executeTakeFirst();
      
      await trx
        .updateTable("obligationChallengeLog")
        .set({ comparisonSnapshotId: null })
        .where("comparisonSnapshotId", "in", orphanSnapshotIds)
        .executeTakeFirst();

      await trx
        .updateTable("packet")
        .set({ baselineSnapshotId: null })
        .where("baselineSnapshotId", "in", orphanSnapshotIds)
        .executeTakeFirst();

      await trx
        .deleteFrom("tradelineSnapshot")
        .where("reportArtifactId", "=", reportArtifactId)
        .executeTakeFirst();
    }

    // Step 3: Delete the report artifact itself
    console.log(`Deleting report artifact ${reportArtifactId}`);
    const deleteResult = await trx
      .deleteFrom("reportArtifact")
      .where("id", "=", reportArtifactId)
      .executeTakeFirst();

    console.log(`Report artifact ${reportArtifactId} deleted`, {
      numDeletedRows: deleteResult.numDeletedRows,
    });

    // Log the deletion in audit log
    await logDelete(userId, "REPORT_ARTIFACT", reportArtifactId, request);
    
    // Log additional audit entry with details about cascade
    await logAudit({
      action: "DELETE",
      entityType: "REPORT_ARTIFACT",
      entityId: reportArtifactId,
      userId,
      details: {
        cascadeDelete: true,
        tradelineCount: tradelineIds.length,
        tradelineIds,
      },
      status: "SUCCESS",
      request,
    });
  });

  console.log(`Cascade delete complete for report artifact ${reportArtifactId}`);
}

/**
 * Delete a single tradeline and all its associated records
 * @param reportArtifactId Optional - only needed when deleting via report artifact cascade
 * @param skipTradelineDeletion If true, skip deleting the tradeline itself (used when CASCADE will handle it)
 */
export async function deleteTradeline(
  trx: Transaction<DB>,
  tradelineId: number,
  userId: number,
  reportArtifactId?: number,
  skipTradelineDeletion: boolean = false
): Promise<void> {
  console.log(`Deleting tradeline ${tradelineId} and all associated records`);

  // First, handle tradeline_snapshots and their dependencies
  const snapshots = await trx
    .selectFrom("tradelineSnapshot")
    .select("id")
    .where("tradelineId", "=", tradelineId)
    .execute();
  const snapshotIds = snapshots.map((s) => s.id);

  if (snapshotIds.length > 0) {
    console.log(`Found ${snapshotIds.length} tradeline snapshots for tradeline ${tradelineId}`);

    // Delete packet_impact_assessment referencing these snapshots
    const impactAssessmentResult = await trx
      .deleteFrom("packetImpactAssessment")
      .where((eb) => eb.or([
        eb("baselineSnapshotId", "in", snapshotIds),
        eb("followupSnapshotId", "in", snapshotIds)
      ]))
      .executeTakeFirst();
    console.log(`Deleted ${impactAssessmentResult.numDeletedRows || 0} packet impact assessments for tradeline ${tradelineId} snapshots`);

    // Null out obligation_challenge_log snapshot references
    const challengeSourceResult = await trx
      .updateTable("obligationChallengeLog")
      .set({ sourceSnapshotId: null })
      .where("sourceSnapshotId", "in", snapshotIds)
      .executeTakeFirst();
    
    const challengeComparisonResult = await trx
      .updateTable("obligationChallengeLog")
      .set({ comparisonSnapshotId: null })
      .where("comparisonSnapshotId", "in", snapshotIds)
      .executeTakeFirst();
    
    console.log(`Nulled out snapshot references in ${Number(challengeSourceResult.numUpdatedRows || 0) + Number(challengeComparisonResult.numUpdatedRows || 0)} obligation challenge logs`);

    // Null out packet baseline_snapshot_id references
    const packetSnapshotResult = await trx
      .updateTable("packet")
      .set({ baselineSnapshotId: null })
      .where("baselineSnapshotId", "in", snapshotIds)
      .executeTakeFirst();
    
    console.log(`Nulled out baseline snapshot references in ${packetSnapshotResult.numUpdatedRows || 0} packets`);

    // Delete the tradeline snapshots
    const snapshotDeleteResult = await trx
      .deleteFrom("tradelineSnapshot")
      .where("tradelineId", "=", tradelineId)
      .executeTakeFirst();
    console.log(`Deleted ${snapshotDeleteResult.numDeletedRows || 0} tradeline snapshots for tradeline ${tradelineId}`);
  }

  // Next, get all packet IDs and obligation instance IDs for this tradeline
  const packets = await trx
    .selectFrom("packet")
    .select("id")
    .where("tradelineId", "=", tradelineId)
    .execute();
  const packetIds = packets.map((p) => p.id);
  console.log(`Found ${packetIds.length} packets for tradeline ${tradelineId}`);

  const obligationInstances = await trx
    .selectFrom("obligationInstance")
    .select("id")
    .where("tradelineId", "=", tradelineId)
    .execute();
  const obligationInstanceIds = obligationInstances.map((o) => o.id);
  console.log(`Found ${obligationInstanceIds.length} obligation instances for tradeline ${tradelineId}`);

  // a. Delete evidence_event where packetId matches
  if (packetIds.length > 0) {
    const evidenceEventResult = await trx
      .deleteFrom("evidenceEvent")
      .where("packetId", "in", packetIds)
      .executeTakeFirst();
    console.log(`Deleted ${evidenceEventResult.numDeletedRows || 0} evidence events for tradeline ${tradelineId}`);
  }

  // b. Delete deadline_event where packetId OR obligationInstanceId matches
  if (packetIds.length > 0 || obligationInstanceIds.length > 0) {
    let query = trx.deleteFrom("deadlineEvent");
    
    if (packetIds.length > 0 && obligationInstanceIds.length > 0) {
      query = query.where((eb) =>
        eb.or([
          eb("packetId", "in", packetIds),
          eb("obligationInstanceId", "in", obligationInstanceIds),
        ])
      );
    } else if (packetIds.length > 0) {
      query = query.where("packetId", "in", packetIds);
    } else {
      query = query.where("obligationInstanceId", "in", obligationInstanceIds);
    }
    
    const deadlineEventResult = await query.executeTakeFirst();
    console.log(`Deleted ${deadlineEventResult.numDeletedRows || 0} deadline events for tradeline ${tradelineId}`);
  }

  // c. Delete evidence_attachment where packetId OR obligationInstanceId matches
  if (packetIds.length > 0 || obligationInstanceIds.length > 0) {
    let query = trx.deleteFrom("evidenceAttachment");
    
    if (packetIds.length > 0 && obligationInstanceIds.length > 0) {
      query = query.where((eb) =>
        eb.or([
          eb("packetId", "in", packetIds),
          eb("obligationInstanceId", "in", obligationInstanceIds),
        ])
      );
    } else if (packetIds.length > 0) {
      query = query.where("packetId", "in", packetIds);
    } else {
      query = query.where("obligationInstanceId", "in", obligationInstanceIds);
    }
    
    const evidenceAttachmentResult = await query.executeTakeFirst();
    console.log(`Deleted ${evidenceAttachmentResult.numDeletedRows || 0} evidence attachments for tradeline ${tradelineId}`);
  }

  // d. Delete packet_compliance_audit where packetId matches
  if (packetIds.length > 0) {
    const packetComplianceResult = await trx
      .deleteFrom("packetComplianceAudit")
      .where("packetId", "in", packetIds)
      .executeTakeFirst();
    console.log(`Deleted ${packetComplianceResult.numDeletedRows || 0} packet compliance audits for tradeline ${tradelineId}`);
  }

  // e. Delete success_metric where obligationInstanceId matches
  if (obligationInstanceIds.length > 0) {
    const successMetricResult = await trx
      .deleteFrom("successMetric")
      .where("obligationInstanceId", "in", obligationInstanceIds)
      .executeTakeFirst();
    console.log(`Deleted ${successMetricResult.numDeletedRows || 0} success metrics for tradeline ${tradelineId}`);
  }

    // f. Delete discrimination_claim where tradelineId OR packetId OR obligationInstanceId matches
  const discriminationResult = await trx
    .deleteFrom("discriminationClaim")
    .where((eb) => {
      const conditions = [eb("tradelineId", "=", tradelineId)];
      if (packetIds.length > 0) {
        conditions.push(eb("packetId", "in", packetIds));
      }
      if (obligationInstanceIds.length > 0) {
        conditions.push(eb("obligationInstanceId", "in", obligationInstanceIds));
      }
      return eb.or(conditions);
    })
    .executeTakeFirst();
  console.log(`Deleted ${discriminationResult.numDeletedRows || 0} discrimination claims for tradeline ${tradelineId}`);

  // g1. Delete postalTransaction records for packets before deleting packets
  if (packetIds.length > 0) {
    const postalTransactionResult = await trx
      .deleteFrom("postalTransaction")
      .where("packetId", "in", packetIds)
      .executeTakeFirst();
    console.log(`Deleted ${postalTransactionResult.numDeletedRows || 0} postal transactions for tradeline ${tradelineId}`);

    // g2. Delete packetImpactAssessment by direct packetId FK (not covered by snapshotId deletion above)
    const packetImpactByPacketResult = await trx
      .deleteFrom("packetImpactAssessment")
      .where("packetId", "in", packetIds)
      .executeTakeFirst();
    console.log(`Deleted ${packetImpactByPacketResult.numDeletedRows || 0} packet impact assessments (by packetId) for tradeline ${tradelineId}`);
  }

  // g. Delete packet where tradelineId matches
  const packetResult = await trx
    .deleteFrom("packet")
    .where("tradelineId", "=", tradelineId)
    .executeTakeFirst();
  console.log(`Deleted ${packetResult.numDeletedRows || 0} packets for tradeline ${tradelineId}`);

  // h. Delete obligation_instance where tradelineId matches
  const obligationInstanceResult = await trx
    .deleteFrom("obligationInstance")
    .where("tradelineId", "=", tradelineId)
    .executeTakeFirst();
  console.log(`Deleted ${obligationInstanceResult.numDeletedRows || 0} obligation instances for tradeline ${tradelineId}`);

  // i. Delete obligation_challenge_log where tradelineId OR reportArtifactId matches
  const obligationChallengeResult = await trx
    .deleteFrom("obligationChallengeLog")
    .where((eb) => {
      const conditions = [eb("tradelineId", "=", tradelineId)];
      if (reportArtifactId !== undefined) {
        conditions.push(eb("reportArtifactId", "=", reportArtifactId));
      }
      return eb.or(conditions);
    })
    .executeTakeFirst();
  console.log(`Deleted ${obligationChallengeResult.numDeletedRows || 0} obligation challenge logs for tradeline ${tradelineId}`);

  // j. Delete metro2_validation_log where tradelineId matches
  const metro2ValidationResult = await trx
    .deleteFrom("metro2ValidationLog")
    .where("tradelineId", "=", tradelineId)
    .executeTakeFirst();
  console.log(`Deleted ${metro2ValidationResult.numDeletedRows || 0} metro2 validation logs for tradeline ${tradelineId}`);

  // k. Delete creditor_obligation_test where tradelineId matches
  const creditorObligationResult = await trx
    .deleteFrom("creditorObligationTest")
    .where("tradelineId", "=", tradelineId)
    .executeTakeFirst();
  console.log(`Deleted ${creditorObligationResult.numDeletedRows || 0} creditor obligation tests for tradeline ${tradelineId}`);

  // l. Delete bankruptcy_record where tradelineId matches
  const bankruptcyResult = await trx
    .deleteFrom("bankruptcyRecord")
    .where("tradelineId", "=", tradelineId)
    .executeTakeFirst();
  console.log(`Deleted ${bankruptcyResult.numDeletedRows || 0} bankruptcy records for tradeline ${tradelineId}`);

  // m. Delete the tradeline itself (unless skipTradelineDeletion is true)
  if (!skipTradelineDeletion) {
    const tradelineResult = await trx
      .deleteFrom("tradeline")
      .where("id", "=", tradelineId)
      .executeTakeFirst();
    console.log(`Deleted tradeline ${tradelineId}`, {
      numDeletedRows: tradelineResult.numDeletedRows,
    });

    // Log audit entry for tradeline deletion
    await logDelete(userId, "TRADELINE", tradelineId);
  } else {
    console.log(`Skipped tradeline ${tradelineId} deletion (will be handled by CASCADE)`);
  }
}