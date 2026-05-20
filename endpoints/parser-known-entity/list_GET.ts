import { schema, OutputType } from "./list_GET.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Admin access required" }),
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const input = schema.parse({
      entityType: url.searchParams.get("entityType") || undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    });

    let query = db.selectFrom("parserKnownEntity").selectAll();

    if (input.entityType) {
      // We cast here because we trust the input or let the query fail if invalid enum, 
      // but better to validate if strict. For now, simple string match is fine for DB.
      query = query.where("entityType", "=", input.entityType as any);
    }

    const entities = await query
      .orderBy("createdAt", "desc")
      .limit(input.limit)
      .offset(input.offset)
      .execute();

    return new Response(
      JSON.stringify({ entities } satisfies OutputType)
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}
