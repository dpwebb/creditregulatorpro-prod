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
    
    const version = await db.selectFrom('softwareVersion')
      .select('locked')
      .where('id', '=', input.versionId)
      .executeTakeFirstOrThrow();
      
    if (version.locked) {
      throw new Error("Cannot add migration to a locked version");
    }
    
    const result = await db.insertInto('versionMigration')
      .values({
        versionId: input.versionId,
        name: input.name,
        description: input.description || null,
        sqlUp: input.sqlUp || null,
        sqlDown: input.sqlDown || null,
        status: "pending"
      })
      .returningAll()
      .executeTakeFirstOrThrow();
      
    await logAudit({
      action: "SCHEMA_CHANGE",
      entityType: "SYSTEM",
      entityId: result.id,
      userId: user.id,
      details: { name: result.name },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify(result satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}