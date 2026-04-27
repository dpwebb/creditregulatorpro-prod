import { db } from "../../helpers/db";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { schema, OutputType } from "./update_POST.schema";

import { logAudit } from "../../helpers/auditLogger";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") throw new BusinessRuleError("Admin only endpoint", 403);
    
    const json = JSON.parse(await request.text());
    const input = schema.parse(json);
    
    const updateData: any = { updatedAt: new Date() };
    if (input.label !== undefined) updateData.label = input.label;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.enabled !== undefined) updateData.enabled = input.enabled;
    if (input.minVersion !== undefined) updateData.minVersion = input.minVersion;
    if (input.maxVersion !== undefined) updateData.maxVersion = input.maxVersion;
    if (input.scope !== undefined) updateData.scope = input.scope;
    
    const result = await db.updateTable('featureFlag')
      .set(updateData)
      .where('id', '=', input.id)
      .returningAll()
      .executeTakeFirstOrThrow();
      
    await logAudit({
      action: "SYSTEM_CHANGE",
      entityType: "SYSTEM",
      entityId: result.id,
      userId: user.id,
      details: { id: result.id, label: result.label },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify(result satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}