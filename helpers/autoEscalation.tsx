import { db } from "./db";
import { logAudit } from "./auditLogger";
import { calculateDeadline } from "./deadlineCalculator";
import { sql } from "kysely";
import { DisputeVectorType, OBLIGATION_SEQUENCES } from "./obligationVectors";
import { getDataDrivenVectorRecommendation } from "./strategyFeedback";

/**
 * Builds the canonical flat sequence from OBLIGATION_SEQUENCES
 * and returns the next dispute vector in the rotation.
 */
const getNextDisputeVector = (currentVector: string | null): DisputeVectorType => {
  // Build flat sequence from canonical OBLIGATION_SEQUENCES
  const flatSequence: DisputeVectorType[] = OBLIGATION_SEQUENCES.flatMap(
    (seq) => seq.vectors.map((v) => v.type)
  );

  if (!currentVector) return flatSequence[0];
  
  const index = flatSequence.indexOf(currentVector as DisputeVectorType);
  
  // If not found or at end of sequence, return terminal vector
  if (index === -1 || index === flatSequence.length - 1) {
    return flatSequence[flatSequence.length - 1]; // TIMING_COMPLIANCE
  }
  
  return flatSequence[index + 1];
};

/**
 * Scans for obligations that are ready for auto-escalation.
 * Criteria: Deadline passed, no response received, not yet escalated.
 */
export const scanForEscalation = async (userId?: number) => {
  let query = db
    .selectFrom("obligationInstance")
    .where("responseDeadline", "<", new Date())
    .where("responseReceivedDate", "is", null)
    .where("escalationTriggered", "is not", true) // Handle null or false
    .where("state", "!=", "PROCEDURALLY_EXHAUSTED") // Don't escalate if already exhausted
    .select([
      "id",
      "tradelineId",
      "userId",
      "disputeVector",
      "responseDeadline",
    ]);

  if (userId) {
    query = query.where("userId", "=", userId);
  }

  return await query.execute();
};

/**
 * Triggers an automatic escalation for a specific obligation instance.
 * 1. Marks old instance as escalated.
 * 2. Creates new instance with next dispute vector.
 * 3. Creates deadline for new instance.
 * 4. Logs audit.
 */
export const triggerEscalation = async (
  obligationInstanceId: number,
  request?: Request
) => {
  // 1. Get current instance details
  const currentInstance = await db
    .selectFrom("obligationInstance")
    .where("id", "=", obligationInstanceId)
    .select(["id", "tradelineId", "userId", "disputeVector", "obligationId"])
    .executeTakeFirstOrThrow();

  // Check if this escalation will result in exhaustion
  const exhaustionCheck = await checkExhaustion(currentInstance.tradelineId!);
  const count = exhaustionCheck.escalationCount;
  const MAX_ESCALATIONS = 7;

  let willBeExhausted = count >= MAX_ESCALATIONS;
  let nextVector: DisputeVectorType = "TIMING_COMPLIANCE";

  const canonicalVectors: DisputeVectorType[] = OBLIGATION_SEQUENCES.flatMap((seq) =>
    seq.vectors.map((vector) => vector.type)
  );
  const usedVectorRows = await db
    .selectFrom("obligationInstance")
    .where("tradelineId", "=", currentInstance.tradelineId!)
    .select("disputeVector")
    .execute();
  const usedVectors = new Set(
    usedVectorRows
      .map((row) => row.disputeVector)
      .filter((value): value is DisputeVectorType => Boolean(value))
  );
  const unusedVectors = canonicalVectors.filter((vector) => !usedVectors.has(vector));

  if (!willBeExhausted) {
    if (count <= 2) {
      nextVector = getNextDisputeVector(currentInstance.disputeVector);
    } else {
      try {
                const rec = await getDataDrivenVectorRecommendation(
          currentInstance.userId!,
          currentInstance.tradelineId!
        );
        nextVector = rec.recommendedVector;
      } catch (err) {
        console.error("Vector recommendation failed, falling back to sequential:", err instanceof Error ? err.message : err);
        nextVector = getNextDisputeVector(currentInstance.disputeVector);
      }
    }

    // If the preferred vector already exists for this tradeline and we still have
    // unused vectors, rotate to the next unused vector to avoid unique/index collisions.
    if (usedVectors.has(nextVector) && unusedVectors.length > 0) {
      nextVector = unusedVectors[0];
    }

    // If every canonical vector has already been used, force procedural exhaustion
    // instead of attempting another duplicate-vector insertion.
    if (unusedVectors.length === 0) {
      willBeExhausted = true;
      nextVector = "TIMING_COMPLIANCE";
    }
  }

  // 2. Transactional update
  return await db.transaction().execute(async (trx) => {
    // A. Mark current as escalated
    await trx
      .updateTable("obligationInstance")
      .set({
        escalationTriggered: true,
        escalationDate: new Date(),
        state: "INSUFFICIENT_RESPONSE", // Or NO_RESPONSE
      })
      .where("id", "=", obligationInstanceId)
      .execute();

    let newInstance: any;

    if (willBeExhausted) {
      // Reuse current instance for terminal state rather than inserting a potentially
      // duplicate terminal row.
      newInstance = await trx
        .updateTable("obligationInstance")
        .set({
          state: "PROCEDURALLY_EXHAUSTED",
          disputeVector: "TIMING_COMPLIANCE",
          notes: `Auto-escalated from instance ${obligationInstanceId} - PHASE 4 REACHED`,
        })
        .where("id", "=", obligationInstanceId)
        .returningAll()
        .executeTakeFirstOrThrow();
    } else {
      // B. Create new obligation instance (Escalation)
      newInstance = await trx
        .insertInto("obligationInstance")
        .values({
          tradelineId: currentInstance.tradelineId,
          userId: currentInstance.userId,
          obligationId: currentInstance.obligationId,
          disputeVector: nextVector,
          createdAt: new Date(),
          challengeSentDate: new Date(), // Assuming we send it immediately or queue it
          state: "OBLIGATION_PENDING",
          notes: `Auto-escalated from instance ${obligationInstanceId}`,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    }

    // C. Calculate and set deadline for new instance (only if not exhausted)
    if (!willBeExhausted) {
      const { deadline } = calculateDeadline(new Date(), "CA", true); // isFollowUp = true
      
      await trx
        .updateTable("obligationInstance")
        .set({ responseDeadline: deadline })
        .where("id", "=", newInstance.id)
        .execute();

      // D. Create deadline event (only if not exhausted)
      try {
        await trx
          .insertInto("deadlineEvent")
          .values({
            obligationInstanceId: newInstance.id,
            packetId: null,
            eventType: "ESCALATION_RESPONSE_DUE",
            deadline,
            title: `Escalation Response Due: ${nextVector}`,
            description: "Auto-generated deadline for escalated challenge.",
            region: "CA",
            isCompleted: false,
            createdAt: new Date(),
          })
          .execute();
      } catch (deadlineError) {
        console.error(
          "Failed to create escalation deadline event:",
          deadlineError instanceof Error ? deadlineError.message : deadlineError
        );
      }
    }

    // E. Audit Log for escalation
    await logAudit({
      action: "ESCALATION_TRIGGERED",
      entityType: "OBLIGATION_INSTANCE",
      entityId: currentInstance.id,
      userId: currentInstance.userId,
      details: {
        fromVector: currentInstance.disputeVector,
        toVector: willBeExhausted ? "TIMING_COMPLIANCE" : nextVector,
        newInstanceId: newInstance.id,
        exhausted: willBeExhausted,
      },
      status: "SUCCESS",
      request,
    });

    // F. Additional audit log if exhausted
    if (willBeExhausted) {
      await logAudit({
        action: "EXHAUSTION_REACHED",
        entityType: "TRADELINE",
        entityId: currentInstance.tradelineId,
        userId: currentInstance.userId,
        details: {
          obligationInstanceId: newInstance.id,
          reason: exhaustionCheck.reason || "Procedural exhaustion - terminal vector reached",
        },
        status: "SUCCESS",
        request,
      });
    }

    return newInstance;
  });
};

/**
 * Checks if a tradeline has reached procedural exhaustion.
 */
export const checkExhaustion = async (tradelineId: number) => {
  // Count total obligation instances for this tradeline
  const result = await db
    .selectFrom("obligationInstance")
    .where("tradelineId", "=", tradelineId)
    .select(sql<number>`count(*)`.as("count"))
    .executeTakeFirst();

  const count = Number(result?.count || 0);
  const MAX_ESCALATIONS = 7; // Updated to match canonical sequence length

    const isExhausted = count >= MAX_ESCALATIONS;

  return {
    isExhausted,
    escalationCount: count,
    reason: isExhausted ? "Max escalations reached" : null,
  };
};

/**
 * Manually marks a tradeline as procedurally exhausted.
 * Updates the latest obligation instance to PROCEDURALLY_EXHAUSTED state.
 */
export const markAsExhausted = async (
  tradelineId: number,
  userId?: number,
  request?: Request
) => {
  return await db.transaction().execute(async (trx) => {
    // Find the latest obligation instance for this tradeline
    const latestInstance = await trx
      .selectFrom("obligationInstance")
      .where("tradelineId", "=", tradelineId)
      .orderBy("createdAt", "desc")
      .select(["id", "userId", "state", "disputeVector"])
      .executeTakeFirst();

    if (!latestInstance) {
      throw new Error(`No obligation instance found for tradeline ${tradelineId}`);
    }

    // Update to exhausted state
    const updatedInstance = await trx
      .updateTable("obligationInstance")
      .set({
        state: "PROCEDURALLY_EXHAUSTED",
        disputeVector: "TIMING_COMPLIANCE",
        notes: sql`COALESCE(notes, '') || '\nManually marked as procedurally exhausted'`,
      })
      .where("id", "=", latestInstance.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    // Log audit event
    await logAudit({
      action: "EXHAUSTION_REACHED",
      entityType: "TRADELINE",
      entityId: tradelineId,
      userId: userId || latestInstance.userId,
      details: {
        obligationInstanceId: latestInstance.id,
        previousState: latestInstance.state,
        previousVector: latestInstance.disputeVector,
        reason: "Manually marked as exhausted",
      },
      status: "SUCCESS",
      request,
    });

    return updatedInstance;
  });
};
