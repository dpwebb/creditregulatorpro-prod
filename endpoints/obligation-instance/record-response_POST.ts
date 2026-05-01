import { schema, OutputType, AnalysisResult } from "./record-response_POST.schema";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { runAllResponseAuditDetectors } from "../../helpers/complianceDetectorResponse";
import { getBureauDisputeAddress } from "../../helpers/bureauDisputeAddresses";
import { logAudit } from "../../helpers/auditLogger";
import { analyzeAndEscalate } from "../../helpers/responseAnalysisPipeline";


/**
 * Maps a free-form responseStatus string to a valid ObligationState enum value.
 * Valid states: OBLIGATION_PENDING, CHALLENGED, NO_RESPONSE, INSUFFICIENT_RESPONSE, PROCEDURALLY_EXHAUSTED
 */
function mapResponseStatusToState(responseStatus: string): string {
  const status = responseStatus.toLowerCase();
  
  // No response / non-response indicators
  if (status.includes("no_response") || status.includes("no response") || status.includes("ignored")) {
    return "NO_RESPONSE";
  }
  
  // Insufficient / generic / rubber-stamp response indicators
  if (
    status.includes("insufficient") ||
    status.includes("generic") ||
    status.includes("rubber") ||
    status.includes("boilerplate") ||
    status.includes("template") ||
    status.includes("denied") ||
    status.includes("rejected") ||
    status.includes("adverse")
  ) {
    return "INSUFFICIENT_RESPONSE";
  }
  
  // Exhaustion indicators
  if (status.includes("exhausted") || status.includes("procedurally")) {
    return "PROCEDURALLY_EXHAUSTED";
  }
  
  // Default: any response received that doesn't match above → INSUFFICIENT_RESPONSE
  // (conservative — a response was received but quality is unconfirmed)
  return "INSUFFICIENT_RESPONSE";
}

export async function handle(request: Request) {
  try {
    const session = await getServerUserSession(request);
    const userId = session.user.id;

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    // 1. Validate ownership and existence
    const existingInstance = await db
      .selectFrom("obligationInstance")
      .innerJoin(
        "tradeline",
        "obligationInstance.tradelineId",
        "tradeline.id"
      )
      .leftJoin("bureau", "tradeline.bureauId", "bureau.id")
      .select([
        "obligationInstance.id",
        "obligationInstance.tradelineId",
        "tradeline.userId",
        "bureau.name as bureauName",
        // We need more fields from existingInstance for the detector if we want to be thorough,
        // but for now we rely on what we have.
      ])
      .where("obligationInstance.id", "=", input.obligationInstanceId)
      .executeTakeFirst();

    if (!existingInstance) {
      return new Response(
        JSON.stringify({ error: "Obligation instance not found" }),
        { status: 404 }
      );
    }

    if (existingInstance.userId !== userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized access to this record" }),
        { status: 403 }
      );
    }

    // 2. Prepare update data
    let updateData: any = {
      responseReceivedDate: new Date(input.responseReceivedDate),
      responseStatus: input.responseStatus,
      responseLetterContent: input.responseLetterContent,
      responseMovDisclosed: input.responseMovDisclosed,
      responseMovDescription: input.responseMovDescription,
      responseItemsDisputed: input.responseItemsDisputed
        ? JSON.stringify(input.responseItemsDisputed)
        : null,
      responseItemsAddressed: input.responseItemsAddressed
        ? JSON.stringify(input.responseItemsAddressed)
        : null,
      responseDocumentationProvided: input.responseDocumentationProvided,
      responseDocumentationTypes: input.responseDocumentationTypes
        ? JSON.stringify(input.responseDocumentationTypes)
        : null,
      responseSenderAddress: input.responseSenderAddress,
      responseAuthorizedSignature: input.responseAuthorizedSignature,
      responseSignatoryName: input.responseSignatoryName,
      responseSignatoryTitle: input.responseSignatoryTitle,
            // Map responseStatus to a valid ObligationState enum value
      state: mapResponseStatusToState(input.responseStatus)
    };

    // 3. Run Audit if requested
    let auditFindings: any[] = [];
    if (input.runAudit) {
      // Determine expected address
      let expectedAddress: string | null = null;
      if (existingInstance.bureauName) {
        const bureauAddress = getBureauDisputeAddress(
          existingInstance.bureauName
        );
        if (bureauAddress) {
          expectedAddress = bureauAddress.fullFormattedAddress;
        }
      }

      // Add expected address to update data
      if (expectedAddress) {
        updateData.responseExpectedAddress = expectedAddress;
      }

      // Construct a temporary object for the detector
      // We merge the existing instance ID with the new input data
      const instanceForAudit = {
        ...existingInstance, // minimal fields needed for ID
        ...updateData,
        // Ensure JSON fields are parsed back to arrays for the detector if needed,
        // but our detector expects Selectable<ObligationInstance> which has JSON types.
        // However, in the detector code we cast: (instance.responseItemsDisputed as string[])
        // So passing the raw arrays from input is actually better if we were calling it directly with input.
        // But the detector takes Selectable<ObligationInstance>.
        // Let's construct a mock object that matches the shape expected by the detector.
        responseItemsDisputed: input.responseItemsDisputed,
        responseItemsAddressed: input.responseItemsAddressed,
        responseDocumentationTypes: input.responseDocumentationTypes,
        // Ensure dates are Date objects
        responseReceivedDate: new Date(input.responseReceivedDate),
      };

      // Run detectors
      auditFindings = runAllResponseAuditDetectors([instanceForAudit as any]);

      // Add audit results to update
      updateData.responseAuditFindings = JSON.stringify(auditFindings);
      updateData.responseAuditCompletedAt = new Date();
    }

    // 4. Perform Update
    let updatedInstance = await db
      .updateTable("obligationInstance")
      .set(updateData)
      .where("id", "=", input.obligationInstanceId)
      .returningAll()
      .executeTakeFirstOrThrow();

    // 4.5. Analyze and Escalate after the response fields are persisted.
    // The analysis pipeline reloads this row, so running it before the update
    // classifies the stale pre-response state.
    let analysisResult: AnalysisResult = null;
    try {
      const escalationOutput = await analyzeAndEscalate(
        input.obligationInstanceId,
        request
      );
      analysisResult = {
        deficiencies: escalationOutput.analysis.deficiencies,
        timingDrift: escalationOutput.analysis.timingDrift,
        recommendedPath: escalationOutput.analysis.recommendedPath,
        responsesReceived: 0, // not directly returned by analyzeAndEscalate; will be enriched below
        nextVector: escalationOutput.nextVector,
      };
      console.log(
        `[record-response] analyzeAndEscalate succeeded for obligationInstanceId=${input.obligationInstanceId}, recommendedPath=${analysisResult.recommendedPath}`
      );

      updatedInstance = await db
        .selectFrom("obligationInstance")
        .selectAll()
        .where("id", "=", input.obligationInstanceId)
        .executeTakeFirstOrThrow();
    } catch (analysisError) {
      console.error(
        `[record-response] analyzeAndEscalate failed for obligationInstanceId=${input.obligationInstanceId} (non-fatal):`,
        analysisError instanceof Error ? analysisError.message : analysisError
      );
    }

    // 5. Log Audit Action
    await logAudit({
      action: "RESPONSE_RECORDED",
      entityType: "OBLIGATION_INSTANCE",
      entityId: input.obligationInstanceId,
      userId: userId,
      status: "SUCCESS",
      details: {
        responseStatus: input.responseStatus,
        auditFindingsCount: auditFindings.length,
      },
      request,
    });

    // The raw Kysely result 'updatedInstance' matches 'Selectable<ObligationInstance>'.
    // We just return it directly since OutputType uses Selectable<ObligationInstance>.
    const finalResponse: OutputType = {
      success: true,
      obligationInstance: updatedInstance,
      auditFindings: auditFindings,
      analysisResult,
    };

    return new Response(
      JSON.stringify(finalResponse)
    );
  } catch (error) {
    console.error("Error recording response:", error);
    return handleEndpointError(error);
  }
}
