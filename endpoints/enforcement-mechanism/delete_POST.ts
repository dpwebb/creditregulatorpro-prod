import { schema, OutputType } from "./delete_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { logAudit } from "../../helpers/auditLogger";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    // Admin-only endpoint
    if (user.role !== 'admin') {
      return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), { status: 403 });
    }

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    // Check if mechanism exists
    const existing = await db
      .selectFrom("enforcementMechanism")
      .select("id")
      .where("id", "=", input.id)
      .executeTakeFirst();

    if (!existing) {
      return new Response(JSON.stringify({ error: "Enforcement mechanism not found" }), { status: 404 });
    }

    // Delete mechanism
    await db
      .deleteFrom("enforcementMechanism")
      .where("id", "=", input.id)
      .execute();

    console.log(`Deleted enforcement mechanism: ${input.id}`);

    await logAudit({
      action: "SYSTEM_CHANGE",
      entityType: "ENFORCEMENT_MECHANISM",
      entityId: input.id,
      userId: user.id,
      details: { id: input.id },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify({ success: true } satisfies OutputType));
  } catch (error) {
    console.error("Error in enforcement-mechanism/delete_POST:", error);
    return handleEndpointError(error);
  }
}