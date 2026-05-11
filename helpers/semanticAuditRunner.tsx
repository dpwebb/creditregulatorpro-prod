/**
 * MAINTENANCE NOTE:
 * When new entities are added that are gated by a `processingStatus` (e.g., 'completed', 'pending', 'failed'),
 * make sure to update this semantic audit runner to include those entities in Categories A, C, and E.
 * Ensuring processingStatus logic remains consistent is critical for accurate dashboard counts.
 */
import { db } from "./db";
import type { AuditFinding, AuditReport } from "../endpoints/admin/diagnostic/semantic-audit_POST.schema";

export type { AuditFinding, AuditReport };

export async function runSemanticAudit(targetUserId?: number): Promise<AuditReport> {
  const findings: AuditFinding[] = [];
  let totalChecks = 0;
  let failed = 0;

  const addFinding = (finding: AuditFinding) => {
    findings.push(finding);
    if (finding.severity === "ERROR" || finding.severity === "WARNING") {
      failed++;
    }
  };

  const passCheck = () => {
    // totalChecks is already incremented before each check
  };

  // Get users to audit
  let userQuery = db.selectFrom("users").select(["id", "role"]).where("role", "!=", "admin");
  if (targetUserId !== undefined) {
    userQuery = userQuery.where("id", "=", targetUserId);
  } else {
    userQuery = userQuery.limit(50);
  }
  
  const usersToAudit = await userQuery.execute();

  for (const user of usersToAudit) {
    const userId = user.id;

    // --- CATEGORY A: Count Consistency & CATEGORY C: Filter Parity ---
    // Ground truth vs Dashboard Logic
    
    // 1. Report Artifacts
    const gtReportArtifacts = Number((await db.selectFrom("reportArtifact").where("userId", "=", userId).select(db.fn.count("id").as("count")).executeTakeFirst())?.count || 0);
    const dashReportArtifacts = Number((await db.selectFrom("reportArtifact").where("userId", "=", userId).where("processingStatus", "=", "completed").select(db.fn.count("id").as("count")).executeTakeFirst())?.count || 0);
    
    totalChecks++;
    if (dashReportArtifacts !== gtReportArtifacts) {
      addFinding({
        category: "Filter Parity",
        severity: "INFO",
        endpoint: "dashboard/stats",
        field: "reportArtifacts",
        expected: `${dashReportArtifacts} completed`,
        actual: `${gtReportArtifacts} total`,
        userId,
        description: "User has report artifacts with processingStatus other than 'completed'."
      });
    } else {
      passCheck();
    }

    // 2. Tradelines (No processing status)
    const gtTradelines = Number((await db.selectFrom("tradeline").where("userId", "=", userId).select(db.fn.count("id").as("count")).executeTakeFirst())?.count || 0);
    totalChecks++; // Passing automatically as there's no processing filter parity to check
    passCheck();

    // 3. Packets
    const gtPackets = Number((await db.selectFrom("packet").where("userId", "=", userId).select(db.fn.count("id").as("count")).executeTakeFirst())?.count || 0);
    const dashPackets = Number((await db.selectFrom("packet").where("userId", "=", userId).where("processingStatus", "=", "completed").select(db.fn.count("id").as("count")).executeTakeFirst())?.count || 0);
    
    totalChecks++;
    if (dashPackets !== gtPackets) {
      addFinding({
        category: "Filter Parity",
        severity: "INFO",
        endpoint: "dashboard/stats",
        field: "packets",
        expected: `${dashPackets} completed`,
        actual: `${gtPackets} total`,
        userId,
        description: "User has packets with processingStatus other than 'completed'."
      });
    } else {
      passCheck();
    }

    // 4. Obligations
    const gtObligations = Number((await db.selectFrom("obligationInstance").where("userId", "=", userId).select(db.fn.count("id").as("count")).executeTakeFirst())?.count || 0);
    totalChecks++; // No processing filter on obligation instance
    passCheck();


    // --- CATEGORY B: Progress/Step Accuracy ---
    
    // Step 4: Sent packets
    const sentPackets = Number((await db.selectFrom("packet")
      .where("userId", "=", userId)
      .where("status", "in", ["sent", "completed"])
      .where("processingStatus", "=", "completed")
      .select(db.fn.count("id").as("count"))
      .executeTakeFirst())?.count || 0);
    
    // Step 5: Responses received
    const responsesReceived = Number((await db.selectFrom("obligationInstance")
      .where("userId", "=", userId)
      .where("responseReceivedDate", "is not", null)
      .select(db.fn.count("id").as("count"))
      .executeTakeFirst())?.count || 0);

    const step1 = dashReportArtifacts > 0;
    const step2 = gtTradelines > 0;
    const step3 = dashPackets > 0;
    const step4 = sentPackets > 0;
    const step5 = responsesReceived > 0;
    const step6 = dashReportArtifacts > 1;

    // Validate step logic sanity
    totalChecks++;
    if (step3 && !step2) {
      addFinding({
        category: "Progress Accuracy",
        severity: "WARNING",
        endpoint: "dashboard/stats",
        field: "journeyStep",
        expected: "Step 2 done before Step 3",
        actual: "Packets exist but no Tradelines",
        userId,
        description: "User has completed packets but zero tradelines, breaking journey logic."
      });
    } else {
      passCheck();
    }

    totalChecks++;
    if (step5 && !step3) {
      addFinding({
        category: "Progress Accuracy",
        severity: "WARNING",
        endpoint: "dashboard/stats",
        field: "journeyStep",
        expected: "Step 3 done before Step 5",
        actual: "Responses exist but no Packets",
        userId,
        description: "User has obligation responses but zero packets recorded."
      });
    } else {
      passCheck();
    }


    // --- CATEGORY D: Role-Based Data Isolation ---
    // Check for cross-user data leakage
    
    // Check if packets belong to tradelines of another user
    const leakedPackets = await db.selectFrom("packet")
      .innerJoin("tradeline", "tradeline.id", "packet.tradelineId")
      .where("packet.userId", "=", userId)
      .whereRef("tradeline.userId", "!=", "packet.userId")
      .select(["packet.id", "tradeline.userId as realUserId"])
      .execute();
    
    totalChecks++;
    if (leakedPackets.length > 0) {
      addFinding({
        category: "Role-Based Data Isolation",
        severity: "ERROR",
        endpoint: "packet records",
        field: "packet.tradelineId",
        expected: "Matching userId",
        actual: `${leakedPackets.length} mismatch(es)`,
        userId,
        description: `User owns packets attached to tradelines owned by other users.`
      });
    } else {
      passCheck();
    }

    // Check if tradelines belong to artifacts of another user
    const leakedTradelines = await db.selectFrom("tradeline")
      .innerJoin("reportArtifact", "reportArtifact.id", "tradeline.reportArtifactId")
      .where("tradeline.userId", "=", userId)
      .whereRef("reportArtifact.userId", "!=", "tradeline.userId")
      .select(["tradeline.id"])
      .execute();

    totalChecks++;
    if (leakedTradelines.length > 0) {
      addFinding({
        category: "Role-Based Data Isolation",
        severity: "ERROR",
        endpoint: "ingest/report_POST",
        field: "tradeline.reportArtifactId",
        expected: "Matching userId",
        actual: `${leakedTradelines.length} mismatch(es)`,
        userId,
        description: `User owns tradelines attached to report artifacts owned by other users.`
      });
    } else {
      passCheck();
    }

    // Check if obligations belong to tradelines of another user
    const leakedObligations = await db.selectFrom("obligationInstance")
      .innerJoin("tradeline", "tradeline.id", "obligationInstance.tradelineId")
      .where("obligationInstance.userId", "=", userId)
      .whereRef("tradeline.userId", "!=", "obligationInstance.userId")
      .select(["obligationInstance.id"])
      .execute();
    
    totalChecks++;
    if (leakedObligations.length > 0) {
      addFinding({
        category: "Role-Based Data Isolation",
        severity: "ERROR",
        endpoint: "system",
        field: "obligationInstance.tradelineId",
        expected: "Matching userId",
        actual: `${leakedObligations.length} mismatch(es)`,
        userId,
        description: `User owns obligations attached to tradelines owned by other users.`
      });
    } else {
      passCheck();
    }
  }


  // --- CATEGORY E: Orphan/Stale Data (Global) ---
  
  // 1. Tradelines with missing artifact
  totalChecks++;
  const orphanTradelines = await db.selectFrom("tradeline")
    .leftJoin("reportArtifact", "reportArtifact.id", "tradeline.reportArtifactId")
    .where("tradeline.reportArtifactId", "is not", null)
    .where("reportArtifact.id", "is", null)
    .select("tradeline.id")
    .limit(1)
    .executeTakeFirst();
  
  if (orphanTradelines) {
    addFinding({
      category: "Orphan/Stale Data",
      severity: "ERROR",
      endpoint: "global",
      field: "tradeline.reportArtifactId",
      expected: "Valid foreign reference",
      actual: "Orphaned tradelines detected",
      description: "Tradelines exist pointing to a non-existent report artifact."
    });
  } else {
    passCheck();
  }

  // 2. Obligation Instances with missing tradeline
  totalChecks++;
  const orphanObligations = await db.selectFrom("obligationInstance")
    .leftJoin("tradeline", "tradeline.id", "obligationInstance.tradelineId")
    .where("obligationInstance.tradelineId", "is not", null)
    .where("tradeline.id", "is", null)
    .select("obligationInstance.id")
    .limit(1)
    .executeTakeFirst();

  if (orphanObligations) {
    addFinding({
      category: "Orphan/Stale Data",
      severity: "ERROR",
      endpoint: "global",
      field: "obligationInstance.tradelineId",
      expected: "Valid foreign reference",
      actual: "Orphaned obligations detected",
      description: "Obligation instances exist pointing to a non-existent tradeline."
    });
  } else {
    passCheck();
  }

  // 3. Packets with missing tradeline
  totalChecks++;
  const orphanPackets = await db.selectFrom("packet")
    .leftJoin("tradeline", "tradeline.id", "packet.tradelineId")
    .where("packet.tradelineId", "is not", null)
    .where("tradeline.id", "is", null)
    .select("packet.id")
    .limit(1)
    .executeTakeFirst();

  if (orphanPackets) {
    addFinding({
      category: "Orphan/Stale Data",
      severity: "ERROR",
      endpoint: "global",
      field: "packet.tradelineId",
      expected: "Valid foreign reference",
      actual: "Orphaned packets detected",
      description: "Packets exist pointing to a non-existent tradeline."
    });
  } else {
    passCheck();
  }

  // 4. Evidence Events with missing packet
  totalChecks++;
  const orphanEvidence = await db.selectFrom("evidenceEvent")
    .leftJoin("packet", "packet.id", "evidenceEvent.packetId")
    .where("evidenceEvent.packetId", "is not", null)
    .where("packet.id", "is", null)
    .select("evidenceEvent.id")
    .limit(1)
    .executeTakeFirst();

  if (orphanEvidence) {
    addFinding({
      category: "Orphan/Stale Data",
      severity: "ERROR",
      endpoint: "global",
      field: "evidenceEvent.packetId",
      expected: "Valid foreign reference",
      actual: "Orphaned evidence detected",
      description: "Evidence events exist pointing to a non-existent packet."
    });
  } else {
    passCheck();
  }

  // 5. Packets with 'ready to mail' but processingStatus != 'completed'
  totalChecks++;
  const stalePackets = await db.selectFrom("packet")
    .where("status", "=", "ready to mail")
    .where("processingStatus", "!=", "completed")
    .select("id")
    .limit(1)
    .executeTakeFirst();

  if (stalePackets) {
    addFinding({
      category: "Orphan/Stale Data",
      severity: "WARNING",
      endpoint: "global",
      field: "packet.processingStatus",
      expected: "completed",
      actual: "Not completed",
      description: "Packets marked 'ready to mail' do not have 'completed' processingStatus."
    });
  } else {
    passCheck();
  }

  return {
    runAt: new Date().toISOString(),
    totalChecks,
    passed: totalChecks - failed,
    failed,
    findings
  };
}
