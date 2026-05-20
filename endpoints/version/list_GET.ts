import { db } from "../../helpers/db";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { OutputType, schema } from "./list_GET.schema";


export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") throw new BusinessRuleError("Admin only endpoint", 403);
    const url = new URL(request.url);
    const input = schema.parse({
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    });
    
    const result = await db.selectFrom('softwareVersion')
      .selectAll()
      .orderBy('createdAt', 'desc')
      .limit(input.limit)
      .offset(input.offset)
      .execute();
      
    return new Response(JSON.stringify(result satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}
