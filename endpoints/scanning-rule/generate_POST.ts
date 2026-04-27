import { schema, OutputType } from "./generate_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError, OriginNotAllowedError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";
import { validateOrigin } from "../../helpers/domainGuard";
import { generateRuleFromUpdate } from "../../helpers/dynamicRuleGenerator";
import { logAudit } from "../../helpers/auditLogger";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(JSON.stringify({ error: "Unauthorized access" }), {
        status: 403,
      });
    }

    const guardResult = await validateOrigin(request);
    if (!guardResult.valid && guardResult.mode === "enforce") {
      throw new OriginNotAllowedError();
    }

    const json = JSON.parse(await request.text());
    const result = schema.parse(json);

    const updateLog = await db
      .selectFrom("regulatoryUpdateLog")
      .selectAll()
      .where("id", "=", result.regulatoryUpdateId)
      .executeTakeFirst();

    if (!updateLog) {
      return new Response(JSON.stringify({ error: "Regulatory update not found" }), {
        status: 404,
      });
    }

    const generatedRule = await generateRuleFromUpdate({
      title: updateLog.title,
      description: updateLog.description,
      jurisdiction: updateLog.jurisdiction,
      changeType: updateLog.changeType,
      statutoryReference: updateLog.statutoryReference,
      effectiveDate: updateLog.effectiveDate instanceof Date 
        ? updateLog.effectiveDate.toISOString() 
        : updateLog.effectiveDate,
    });

    const insertedRule = await db
      .insertInto("dynamicScanningRule")
      .values({
        regulatoryUpdateId: updateLog.id,
        title: generatedRule.title,
        description: generatedRule.description,
        ruleDefinition: JSON.stringify(generatedRule.ruleDefinition),
        violationCategory: generatedRule.violationCategory,
        severity: generatedRule.severity,
        confidenceScore: String(generatedRule.confidenceScore),
        userExplanationTemplate: generatedRule.userExplanationTemplate,
        recommendedActionTemplate: generatedRule.recommendedActionTemplate,
        statutoryBasis: generatedRule.statutoryBasis,
        status: "PROPOSED",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await logAudit({
      action: "SYSTEM_CHANGE",
      entityType: "SYSTEM",
      entityId: insertedRule.id,
      userId: user.id,
      details: { title: insertedRule.title },
      status: "SUCCESS",
      request,
    });

    return new Response(
      JSON.stringify({
        success: true,
        rule: insertedRule,
      } satisfies OutputType)
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}