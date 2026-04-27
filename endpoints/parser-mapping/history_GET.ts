import { db } from "../../helpers/db";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { schema, OutputType } from "./history_GET.schema";
import superjson from "superjson";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      throw new BusinessRuleError("Unauthorized: Admin role required", 403);
    }

    const url = new URL(request.url);
    const mappingIdStr = url.searchParams.get("mappingId");
    
    const input = schema.parse({ 
      mappingId: mappingIdStr ? parseInt(mappingIdStr, 10) : undefined 
    });

    let query = db.selectFrom("parserMappingVersion").selectAll();
    
    if (input.mappingId) {
      query = query.where("mappingId", "=", input.mappingId);
    }

    const versions = await query
      .orderBy("changedAt", "desc")
      .limit(100)
      .execute();

    return new Response(superjson.stringify({ versions } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}