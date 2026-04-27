import { schema, OutputType } from "./generate-all_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError, OriginNotAllowedError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";
import { validateOrigin } from "../../helpers/domainGuard";
import { generateRuleFromUpdate } from "../../helpers/dynamicRuleGenerator";

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

    // Ensure we parse the body (even if empty) to validate the schema
    const json = JSON.parse(await request.text());
    schema.parse(json);

    // Count total regulatory updates to provide meaningful feedback
    const totalResult = await db
      .selectFrom("regulatoryUpdateLog")
      .select((eb) => eb.fn.countAll<number>().as("total"))
      .executeTakeFirstOrThrow();
    const total = Number(totalResult.total);

    // Find all regulatory updates that do not have an associated scanning rule
    const pendingUpdates = await db
      .selectFrom("regulatoryUpdateLog")
      .where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom("dynamicScanningRule")
              .select("id")
              .whereRef("dynamicScanningRule.regulatoryUpdateId", "=", "regulatoryUpdateLog.id")
          )
        )
      )
      .selectAll()
      .execute();

    let generated = 0;
    let skipped = 0;
    let errors = 0;
    let message = "";

    if (pendingUpdates.length === 0) {
      if (total === 0) {
        message = "No regulatory updates exist yet.";
      } else {
        message = `All ${total} regulatory update${total === 1 ? "" : "s"} already have scanning rules generated. No new rules needed.`;
      }
    }

    const CONCURRENCY = 3;

    // Process in batches of CONCURRENCY to balance speed vs. API rate limits
    for (let i = 0; i < pendingUpdates.length; i += CONCURRENCY) {
      const batch = pendingUpdates.slice(i, i + CONCURRENCY);

      const results = await Promise.allSettled(
        batch.map(async (updateLog) => {
          const generatedRule = await generateRuleFromUpdate({
            title: updateLog.title,
            description: updateLog.description,
            jurisdiction: updateLog.jurisdiction,
            changeType: updateLog.changeType,
            statutoryReference: updateLog.statutoryReference,
            effectiveDate:
              updateLog.effectiveDate instanceof Date
                ? updateLog.effectiveDate.toISOString()
                : updateLog.effectiveDate,
          });

          await db
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
            .execute();

          return updateLog.id;
        })
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        if (result.status === "fulfilled") {
          generated++;
        } else {
          console.error(
            `Failed to generate rule for update ID ${batch[j].id}:`,
            result.reason
          );
          errors++;
        }
      }
    }

    if (pendingUpdates.length > 0) {
      if (errors > 0) {
        message = `Generated ${generated} rule${generated === 1 ? "" : "s"} with ${errors} error${errors === 1 ? "" : "s"}.`;
      } else {
        message = `Generated ${generated} rule${generated === 1 ? "" : "s"} successfully.`;
      }
    }

    return new Response(
      JSON.stringify({
        generated,
        skipped,
        errors,
        message,
      } satisfies OutputType)
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}