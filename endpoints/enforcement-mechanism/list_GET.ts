import { schema, OutputType } from "./list_GET.schema";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    console.log(`enforcement-mechanism/list_GET called by user ${user.id}`);

    const url = new URL(request.url);
    const jurisdiction = url.searchParams.get("jurisdiction") || undefined;
    const mechanismType = url.searchParams.get("mechanismType") || undefined;

    // Validate input using schema
    const input = schema.parse({
      jurisdiction,
      mechanismType
    });

    let query = db
      .selectFrom("enforcementMechanism")
      .selectAll();

    if (input.jurisdiction) {
      query = query.where("jurisdiction", "=", input.jurisdiction);
    }

    if (input.mechanismType) {
      // Cast to any to avoid strict type mismatch with Kysely generated types vs Zod enum
      query = query.where("mechanismType", "=", input.mechanismType as any);
    }

    // Order by jurisdiction, then mechanismType
    query = query
      .orderBy("jurisdiction", "asc")
      .orderBy("mechanismType", "asc");

    const mechanisms = await query.execute();

    return new Response(JSON.stringify({ mechanisms } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}