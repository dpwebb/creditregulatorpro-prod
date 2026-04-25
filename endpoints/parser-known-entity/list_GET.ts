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
    const entityType = url.searchParams.get("entityType");

    // Validate query params using schema (though schema is empty object in GET usually, we can parse params manually or extend schema if needed, but here we just use URL params directly for GET)
    // Actually, let's stick to the pattern. For GET requests with query params, we usually parse the URL search params.
    // The schema defined in list_GET.schema.ts is for the client-side helper input, which maps to query params.

    let query = db.selectFrom("parserKnownEntity").selectAll();

    if (entityType) {
      // We cast here because we trust the input or let the query fail if invalid enum, 
      // but better to validate if strict. For now, simple string match is fine for DB.
      query = query.where("entityType", "=", entityType as any);
    }

    const entities = await query.orderBy("createdAt", "desc").execute();

    return new Response(
      JSON.stringify({ entities } satisfies OutputType)
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}