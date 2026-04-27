import { schema, OutputType } from "./compliance-config_POST.schema";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { logAudit } from "../../helpers/auditLogger";


export async function handle(request: Request) {
  try {
    // Authentication check
    const { user } = await getServerUserSession(request);

    if (user.role !== "admin") {
      console.warn(
        `Unauthorized admin endpoint access attempt by user ${user.id} (role: ${user.role})`
      );
      return new Response(
        JSON.stringify({ error: "Admin privileges required" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    if (input.configs.length === 0) {
      return new Response(JSON.stringify([] satisfies OutputType));
    }

    // Perform upsert for each config
    // We use a transaction to ensure atomicity, although for bulk updates it might be fine without if partial failure is acceptable.
    // Given the requirement "Return all updated/created records", doing it in a transaction is safer.
    
    const updatedRecords = await db.transaction().execute(async (trx) => {
      const results = [];
      
      for (const config of input.configs) {
        const result = await trx
          .insertInto("complianceConfig")
          .values({
            violationCategory: config.violationCategory,
            enabled: config.enabled,
            confidenceThreshold: config.confidenceThreshold,
            userExplanationTemplate: config.userExplanationTemplate,
            recommendedActionTemplate: config.recommendedActionTemplate,
            updatedByUserId: user.id,
            updatedAt: new Date(), // Explicitly setting updatedAt for new records too
          })
          .onConflict((oc) =>
            oc.column("violationCategory").doUpdateSet({
              enabled: (eb) => eb.ref("excluded.enabled"),
              confidenceThreshold: (eb) => eb.ref("excluded.confidenceThreshold"),
              userExplanationTemplate: (eb) => eb.ref("excluded.userExplanationTemplate"),
              recommendedActionTemplate: (eb) => eb.ref("excluded.recommendedActionTemplate"),
              updatedByUserId: (eb) => eb.ref("excluded.updatedByUserId"),
              updatedAt: (eb) => eb.ref("excluded.updatedAt"),
            })
          )
          .returningAll()
          .executeTakeFirstOrThrow();
        
        results.push(result);
      }
      
      return results;
    });

    await logAudit({
      action: "CONFIG_UPDATE",
      entityType: "SYSTEM",
      userId: user.id,
      details: { violationCategories: input.configs.map((c) => c.violationCategory) },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify(updatedRecords satisfies OutputType));
  } catch (error) {
    console.error("Error updating compliance configs:", error);

    if (error instanceof Error && error.message.includes("Not authenticated")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    return handleEndpointError(error);
  }
}