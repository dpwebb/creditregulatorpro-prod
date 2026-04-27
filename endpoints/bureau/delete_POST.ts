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
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    }

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    const deletedBureau = await db
      .deleteFrom('bureau')
      .where('id', '=', input.id)
      .returningAll()
      .executeTakeFirst();

    if (!deletedBureau) {
      return new Response(JSON.stringify({ error: "Bureau not found" }), { status: 404 });
    }

    await logAudit({
      action: "SYSTEM_CHANGE",
      entityType: "BUREAU",
      entityId: deletedBureau.id,
      userId: user.id,
      details: { name: deletedBureau.name, id: deletedBureau.id },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify({ success: true } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}