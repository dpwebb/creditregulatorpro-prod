import { db } from "../../helpers/db";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { schema, OutputType } from "./update_POST.schema";


export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") throw new BusinessRuleError("Admin only endpoint", 403);
    
    const json = JSON.parse(await request.text());
    const input = schema.parse(json);
    
    const migrationInfo = await db.selectFrom('versionMigration')
      .innerJoin('softwareVersion', 'versionMigration.versionId', 'softwareVersion.id')
      .select(['versionMigration.id', 'softwareVersion.locked'])
      .where('versionMigration.id', '=', input.id)
      .executeTakeFirstOrThrow();
      
    if (migrationInfo.locked) throw new Error("Cannot modify migration of a locked version");
    
    const updateData: any = { status: input.status };
    if (input.status === 'applied') {
      updateData.appliedAt = new Date();
    }
    
    const updated = await db.updateTable('versionMigration')
      .set(updateData)
      .where('id', '=', input.id)
      .returningAll()
      .executeTakeFirstOrThrow();
      
    return new Response(JSON.stringify(updated satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}