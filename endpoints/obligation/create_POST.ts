import { schema, OutputType } from "./create_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { logCreate, logAudit } from "../../helpers/auditLogger";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    // Admin-only endpoint
    if (user.role !== 'admin') {
      return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), { status: 403 });
    }
    
    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    const newObligation = await db
      .insertInto('obligation')
      .values({
        description: input.description,
        obligationType: input.obligationType ?? null,
        section: input.section,
        jurisdiction: input.jurisdiction ?? null,
        statutoryReference: input.statutoryReference ?? null,
        timeframeDays: input.timeframeDays ?? null,
        notes: input.notes ?? null,
        dutyType: input.dutyType ?? null,
        region: input.region ?? null,
        createdAt: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await logAudit({
      action: "SYSTEM_CHANGE",
      entityType: "OBLIGATION",
      entityId: newObligation.id,
      userId: user.id,
      details: {
        description: newObligation.description,
        obligationType: newObligation.obligationType,
        section: newObligation.section,
        jurisdiction: newObligation.jurisdiction,
      },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify({ obligation: newObligation } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}