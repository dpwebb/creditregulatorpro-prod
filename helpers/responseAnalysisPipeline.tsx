import { db } from "./db";
import { logAudit } from "./auditLogger";
import {
  detectResponseDeficiencies,
  calculateTimingDrift,
  determineEscalationPath,
} from "./obligationTestEngine";
import { ObligationState } from "./schema";
import type { DisputeVectorType } from "./obligationVectors";

export interface ResponseAnalysisResult {
  deficiencies: string[];
  timingDrift: number;
  recommendedPath:
    | "CONTINUE_SEQUENCE"
    | "ESCALATE_TO_FCAC"
    | "MARK_EXHAUSTED"
    | "RETRY";
  responsesReceived: number;
}

/**
 * Analyzes a given obligation instance's response without triggering any side effects.
 * Useful for dry-runs or previewing the analysis in the UI.
 *
 * @param obligationInstanceId The ID of the obligation instance to analyze
 * @returns The analysis findings and recommended next step
 */
export async function analyzeResponse(
  obligationInstanceId: number,
): Promise<ResponseAnalysisResult & { instance: any }> {
  // 1. Fetch the obligation instance
  const instance = await db
    .selectFrom("obligationInstance")
    .where("id", "=", obligationInstanceId)
    .selectAll()
    .executeTakeFirstOrThrow();

  if (!instance.tradelineId) {
    throw new Error(
      `ObligationInstance ${obligationInstanceId} is missing a tradelineId.`,
    );
  }

  // 2. Count prior responses for this tradeline
  const { count } = await db
    .selectFrom("obligationInstance")
    .where("tradelineId", "=", instance.tradelineId)
    .where("responseReceivedDate", "is not", null)
    .select((eb) => eb.fn.count<number>("id").as("count"))
    .executeTakeFirstOrThrow();

  const responsesReceived = Number(count);

  // 3. Extract text to analyze
  const responseText = [
    instance.responseLetterContent,
    instance.responseMovDescription,
    instance.notes,
  ]
    .filter(Boolean)
    .join(" ");

  const vector = (instance.disputeVector ||
    "AUTHORITY_TO_REPORT") as DisputeVectorType;

  // 4. Detect Deficiencies
  let deficiencies: string[] = [];
  if (!responseText.trim()) {
    deficiencies.push("No response text provided or recorded.");
  } else {
    deficiencies = detectResponseDeficiencies(responseText, vector);
  }

  // 5. Calculate Timing Drift
  let timingDrift = 0;
  if (instance.responseReceivedDate && instance.responseDeadline) {
    timingDrift = calculateTimingDrift(
      new Date(instance.responseReceivedDate),
      new Date(instance.responseDeadline),
    );
  }

  // 6. Determine Next Path
  const state = (instance.state || "CHALLENGED") as ObligationState;
  const path = determineEscalationPath(state, responsesReceived, deficiencies);

  return {
    instance,
    deficiencies,
    timingDrift,
    recommendedPath: path,
    responsesReceived,
  };
}

/**
 * Main orchestrator function that analyzes the response, persists the findings,
 * and automatically triggers the recommended escalation path.
 *
 * @param obligationInstanceId The ID of the obligation instance to process
 * @param request Optional request object for IP/UserAgent auditing
 */
export async function analyzeAndEscalate(
  obligationInstanceId: number,
  request?: Request,
) {
  // 1. Run the analysis
  const analysisResult = await analyzeResponse(obligationInstanceId);
  const {
    instance,
    deficiencies,
    timingDrift,
    recommendedPath,
  } = analysisResult;

  // 2. Persist the analysis results back to the instance
  await db
    .updateTable("obligationInstance")
    .set({
      responseAuditFindings: JSON.stringify({
        deficiencies,
        timingDrift,
        recommendedPath,
      }),
      responseAuditCompletedAt: new Date(),
    })
    .where("id", "=", obligationInstanceId)
    .execute();

  const escalationResult = null;
  const nextVector = null;

  try {
    // 3. Legacy escalation side effects are reset.
    // Keep the analysis and audit trail, but do not create the next dispute vector.

    // 4. Log the successful orchestration
    await logAudit({
      action: "RESPONSE_RECORDED",
      entityType: "OBLIGATION_INSTANCE",
      entityId: obligationInstanceId,
      userId: instance.userId,
      status: "SUCCESS",
      details: {
        deficiencies,
        timingDrift,
        recommendedPath,
        escalated: !!escalationResult,
        nextVector,
      },
      request,
    });
  } catch (error) {
    // Log failure if escalation breaks
    await logAudit({
      action: "RESPONSE_RECORDED",
      entityType: "OBLIGATION_INSTANCE",
      entityId: obligationInstanceId,
      userId: instance.userId,
      status: "FAILURE",
      errorMessage:
        error instanceof Error ? error.message : "Failed to process escalation",
      details: { recommendedPath },
      request,
    });
    throw error;
  }

  return {
    analysis: {
      deficiencies,
      timingDrift,
      recommendedPath,
    },
    escalationResult,
    nextVector,
  };
}
