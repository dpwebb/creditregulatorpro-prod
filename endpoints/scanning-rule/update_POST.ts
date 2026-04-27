import { schema, OutputType } from "./update_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";
import { logAudit } from "../../helpers/auditLogger";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(JSON.stringify({ error: "Unauthorized access" }), {
        status: 403,
      });
    }

    const json = JSON.parse(await request.text());
    const result = schema.parse(json);

    const existingRule = await db
      .selectFrom("dynamicScanningRule")
      .select(["status", "regulatoryUpdateId"])
      .where("id", "=", result.id)
      .executeTakeFirst();

    if (!existingRule) {
      return new Response(JSON.stringify({ error: "Rule not found" }), {
        status: 404,
      });
    }

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (result.title !== undefined) updateData.title = result.title;
    if (result.description !== undefined) updateData.description = result.description;
    if (result.violationCategory !== undefined) updateData.violationCategory = result.violationCategory;
    if (result.severity !== undefined) updateData.severity = result.severity;
    if (result.confidenceScore !== undefined) updateData.confidenceScore = String(result.confidenceScore);
    if (result.userExplanationTemplate !== undefined) updateData.userExplanationTemplate = result.userExplanationTemplate;
    if (result.recommendedActionTemplate !== undefined) updateData.recommendedActionTemplate = result.recommendedActionTemplate;
    if (result.statutoryBasis !== undefined) updateData.statutoryBasis = result.statutoryBasis;
    
    if (result.ruleDefinition !== undefined) {
      updateData.ruleDefinition = JSON.stringify(result.ruleDefinition);
    }

    if (result.status !== undefined) {
      updateData.status = result.status;
      if (result.status === "ACTIVE" && existingRule.status !== "ACTIVE") {
        updateData.approvedAt = new Date();
        updateData.approvedBy = user.id;
      }
    }

        await db
      .updateTable("dynamicScanningRule")
      .set(updateData)
      .where("id", "=", result.id)
      .execute();

    // Auto-promote regulatory update to APPLIED when a rule is activated
    if (result.status === "ACTIVE" && existingRule.status !== "ACTIVE" && existingRule.regulatoryUpdateId) {
      const regUpdate = await db
        .selectFrom("regulatoryUpdateLog")
        .select(["id", "status", "reviewedAt", "reviewedBy"])
        .where("id", "=", existingRule.regulatoryUpdateId)
        .executeTakeFirst();

      if (regUpdate && (regUpdate.status === "DETECTED" || regUpdate.status === "UNDER_REVIEW")) {
        await db
          .updateTable("regulatoryUpdateLog")
          .set({
            status: "APPLIED",
            appliedAt: new Date(),
            reviewedAt: regUpdate.reviewedAt ?? new Date(),
            reviewedBy: regUpdate.reviewedBy ?? String(user.id),
          })
          .where("id", "=", existingRule.regulatoryUpdateId)
          .execute();
      }
    }

    await logAudit({
      action: "SYSTEM_CHANGE",
      entityType: "SYSTEM",
      entityId: result.id,
      userId: user.id,
      details: { id: result.id },
      status: "SUCCESS",
      request,
    });

    return new Response(
      JSON.stringify({
        success: true,
      } satisfies OutputType)
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}