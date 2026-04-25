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

    // Check if obligation is statutory
    const existing = await db
      .selectFrom("obligation")
      .select(["id", "isStatutory"])
      .where("id", "=", input.id)
      .executeTakeFirst();

    if (!existing) {
      return new Response(JSON.stringify({ error: "Obligation not found" }), { status: 404 });
    }

    if (existing.isStatutory) {
      return new Response(JSON.stringify({ error: "Cannot delete statutory obligations" }), { status: 403 });
    }

    // Check for references in obligationInstance table
    const instanceRef = await db
      .selectFrom("obligationInstance")
      .select("id")
      .where("obligationId", "=", input.id)
      .executeTakeFirst();

    if (instanceRef) {
      return new Response(JSON.stringify({ error: "Cannot delete obligation that is referenced by obligation instances." }), { status: 400 });
    }

    const result = await db
      .deleteFrom("obligation")
      .where("id", "=", input.id)
      .executeTakeFirst();

    if (Number(result.numDeletedRows) === 0) {
       return new Response(JSON.stringify({ error: "Obligation not found or already deleted" }), { status: 404 });
    }

    await logAudit({
      action: "SYSTEM_CHANGE",
      entityType: "OBLIGATION",
      entityId: input.id,
      userId: user.id,
      details: { id: input.id },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify({ success: true } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}