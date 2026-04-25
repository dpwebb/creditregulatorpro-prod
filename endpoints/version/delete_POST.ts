import { db } from "../../helpers/db";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { schema, OutputType } from "./delete_POST.schema";


export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") throw new BusinessRuleError("Admin only endpoint", 403);
    
    const json = JSON.parse(await request.text());
    const input = schema.parse(json);
    
    const version = await db.selectFrom('softwareVersion')
      .select(['locked', 'status'])
      .where('id', '=', input.id)
      .executeTakeFirstOrThrow();
      
    if (version.locked || version.status === 'released') {
      throw new BusinessRuleError("Cannot delete a locked or released version", 409);
    }
    
    await db.transaction().execute(async (trx) => {
      // Manually remove dependencies first as ON DELETE CASCADE is not strictly guaranteed by schema
      await trx.deleteFrom('versionMigration').where('versionId', '=', input.id).execute();
      await trx.deleteFrom('softwareVersion').where('id', '=', input.id).execute();
    });
      
    return new Response(JSON.stringify({ success: true } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}