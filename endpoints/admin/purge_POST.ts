import { schema, OutputType } from "./purge_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    // Admin-only endpoint
    if (user.role !== 'admin') {
      console.warn(`Unauthorized admin endpoint access attempt by user ${user.id} (role: ${user.role}) on ${request.url}`);
      return new Response(
        JSON.stringify({ error: "Admin privileges required" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Parse input to validate it matches the schema (even if empty)
    const json = JSON.parse(await request.text());
    schema.parse(json);

    const now = new Date();

    // Execute the delete operation
    // We use executeTakeFirst() because we are running a single delete statement
    // and want a single DeleteResult object.
    const result = await db
      .deleteFrom('reportArtifact')
      .where('expiresAt', '<', now)
      .executeTakeFirst();

    const purgedCount = Number(result.numDeletedRows);

    // Audit log
    console.log(`[Purge Audit] Successfully purged ${purgedCount} expired report artifacts at ${now.toISOString()}`);

    return new Response(
      JSON.stringify({ 
        ok: true, 
        purgedCount 
      } satisfies OutputType)
    );

  } catch (error) {
    console.error("[Purge Audit] Failed to purge artifacts:", error);
    return handleEndpointError(error);
  }
}