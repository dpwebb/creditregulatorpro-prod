import { db } from "../../helpers/db";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { schema, OutputType } from "./delete_POST.schema";

import { logAudit } from "../../helpers/auditLogger";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") throw new BusinessRuleError("Admin only endpoint", 403);
    
    const json = JSON.parse(await request.text());
    const input = schema.parse(json);
    
    await db.deleteFrom('featureFlag')
      .where('id', '=', input.id)
      .execute();

    await logAudit({
      action: "FEATURE_REMOVED",
      entityType: "SYSTEM",
      entityId: input.id,
      userId: user.id,
      details: { id: input.id },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify({ success: true } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}