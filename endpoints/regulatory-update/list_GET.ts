import { schema, OutputType } from "./list_GET.schema";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    console.log(`regulatory-update/list_GET called by user ${user.id}`);

    const url = new URL(request.url);
    const jurisdiction = url.searchParams.get("jurisdiction") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const changeType = url.searchParams.get("changeType") || undefined;
    const source = url.searchParams.get("source") || undefined;

    // Validate input using schema
    const input = schema.parse({
      jurisdiction,
      status,
      changeType,
      source,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    });

    let query = db
      .selectFrom("regulatoryUpdateLog")
      .selectAll();

    if (input.jurisdiction) {
      query = query.where("jurisdiction", "=", input.jurisdiction);
    }

    if (input.status) {
      query = query.where("status", "=", input.status as any);
    }

    if (input.changeType) {
      query = query.where("changeType", "=", input.changeType as any);
    }

    if (input.source) {
      query = query.where("source", "=", input.source as any);
    }

    // Order by detectedAt DESC (newest first)
    query = query
      .orderBy("detectedAt", "desc")
      .limit(input.limit)
      .offset(input.offset);

    const updates = await query.execute();

    return new Response(JSON.stringify({ updates } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}
