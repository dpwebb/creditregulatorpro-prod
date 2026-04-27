import { db } from "../../helpers/db";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { schema, OutputType } from "./create_POST.schema";

import { logAudit } from "../../helpers/auditLogger";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") throw new BusinessRuleError("Admin only endpoint", 403);
    
    const json = JSON.parse(await request.text());
    const input = schema.parse(json);
    
    const result = await db.insertInto('featureFlag')
      .values({
        key: input.key,
        label: input.label,
        description: input.description || null,
        enabled: input.enabled,
        minVersion: input.minVersion || null,
        maxVersion: input.maxVersion || null,
        scope: input.scope
      })
      .returningAll()
      .executeTakeFirstOrThrow();
      
    await logAudit({
      action: "FEATURE_ADDED",
      entityType: "SYSTEM",
      entityId: result.id,
      userId: user.id,
      details: { key: result.key, label: result.label },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify(result satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}