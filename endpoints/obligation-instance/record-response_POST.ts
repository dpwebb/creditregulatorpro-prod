import { schema, type OutputType, type AnalysisResult } from "./record-response_POST.schema";
import { db } from "../../helpers/db";
import type { Json } from "../../helpers/schema";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { runAllResponseAuditDetectors } from "../../helpers/complianceDetectorResponse";
import { getBureauDisputeAddress } from "../../helpers/bureauDisputeAddresses";
import { logAudit } from "../../helpers/auditLogger";
import { analyzeAndEscalate } from "../../helpers/responseAnalysisPipeline";
import { classifyBureauResponse } from "../../helpers/bureauResponseClassifier";

function toJsonArray(value: string[] | undefined): Json | null {
  return value === undefined ? null : (JSON.parse(JSON.stringify(value)) as Json);
}

export async function handle(request: Request) {
  try {
    const session = await getServerUserSession(request);
    const userId = session.user.id;
    const isAdmin = session.user.role === "admin";

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
        "obligationInstance.responseDeadline",
        "tradeline.userId",
        "bureau.name as bureauName",
      ])
      .where("obligationInstance.id", "=", input.obligationInstanceId)
      .executeTakeFirst();

    if (!existingInstance) {
      return new Response(
        JSON.stringify({ error: "Obligation instance not found" }),
        { status: 404 }
      );
    }

    if (!isAdmin && existingInstance.userId !== userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized access to this record" }),
        { status: 403 }
      );
    }

    // 2. Prepare update data
    const responseReceivedDate = new Date(input.responseReceivedDate);
    const responseClassification = classifyBureauResponse({
      communicationType: "BUREAU_RESPONSE_RECEIVED",
      responseStatus: input.responseStatus,
      responseLetterContent: input.responseLetterContent,
      responseMovDisclosed: input.responseMovDisclosed,
      responseMovDescription: input.responseMovDescription,
      responseItemsDisputed: input.responseItemsDisputed,
      responseItemsAddressed: input.responseItemsAddressed,
      responseDocumentationProvided: input.responseDocumentationProvided,
      responseDocumentationTypes: input.responseDocumentationTypes,
      responseReceivedDate,
      responseDeadline: existingInstance.responseDeadline,
    });

    const updateData: any = {
      responseReceivedDate: responseClassification.responseReceived ? responseReceivedDate : null,
      responseStatus: responseClassification.responseStatus,
      responseLetterContent: input.responseLetterContent,
      responseMovDisclosed: input.responseMovDisclosed,
      responseMovDescription: input.responseMovDescription,
      responseItemsDisputed: toJsonArray(input.responseItemsDisputed),
      responseItemsAddressed: toJsonArray(input.responseItemsAddressed),
      responseDocumentationProvided: input.responseDocumentationProvided,
      responseDocumentationTypes: toJsonArray(input.responseDocumentationTypes),
      responseSenderAddress: input.responseSenderAddress,
      responseAuthorizedSignature: input.responseAuthorizedSignature,
      responseSignatoryName: input.responseSignatoryName,
      responseSignatoryTitle: input.responseSignatoryTitle,
      state: responseClassification.obligationState,
    };

    if (responseClassification.successOutcome) {
      updateData.successOutcome = responseClassification.successOutcome;
    }

    // 3. Run Audit if requested
    let auditFindings: any[] = [];
    if (input.runAudit && responseClassification.responseReceived) {
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

      const instanceForAudit = {
        ...existingInstance,
        ...updateData,
        responseItemsDisputed: input.responseItemsDisputed,
        responseItemsAddressed: input.responseItemsAddressed,
        responseDocumentationTypes: input.responseDocumentationTypes,
        responseReceivedDate,
      };

      auditFindings = runAllResponseAuditDetectors([instanceForAudit as any]);

      updateData.responseAuditFindings = JSON.parse(JSON.stringify(auditFindings)) as Json;
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
      if (responseClassification.followUpRecommendation === "NO_FOLLOW_UP_REQUIRED") {
        console.log(
          `[record-response] skipped escalation for obligationInstanceId=${input.obligationInstanceId}, responseType=${responseClassification.responseType}`
        );
      } else {
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
      }
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
        responseStatus: responseClassification.responseStatus,
        responseClassification,
        auditFindingsCount: auditFindings.length,
      },
      request,
    });

    const finalResponse: OutputType = {
      success: true,
      obligationInstance: updatedInstance,
      auditFindings: auditFindings,
      analysisResult,
      responseClassification,
    };

    return new Response(
      JSON.stringify(finalResponse)
    );
  } catch (error) {
    console.error("Error recording response:", error);
    return handleEndpointError(error);
  }
}
