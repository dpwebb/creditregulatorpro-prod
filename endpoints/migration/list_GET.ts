import { db } from "../../helpers/db";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { schema, OutputType } from "./list_GET.schema";


export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") throw new BusinessRuleError("Admin only endpoint", 403);
    
    const url = new URL(request.url);
    const input = schema.parse({
      versionId: url.searchParams.get("versionId")
    });
    
    const result = await db.selectFrom('versionMigration')
      .selectAll()
      .where('versionId', '=', input.versionId)
      .orderBy('createdAt', 'asc')
      .execute();
      
    return new Response(JSON.stringify(result satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}