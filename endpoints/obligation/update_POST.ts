import { schema, OutputType } from "./update_POST.schema";

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

    // Check if obligation exists and if it is statutory
    const existing = await db
      .selectFrom("obligation")
      .select(["id", "isStatutory"])
      .where("id", "=", input.id)
      .executeTakeFirst();

    if (!existing) {
      return new Response(JSON.stringify({ error: "Obligation not found" }), { status: 404 });
    }

    if (existing.isStatutory) {
      return new Response(JSON.stringify({ error: "Cannot modify statutory obligations" }), { status: 403 });
    }

    const updateValues: Record<string, any> = {};
    if (input.description !== undefined) updateValues.description = input.description;
    if (input.obligationType !== undefined) updateValues.obligationType = input.obligationType;
    if (input.section !== undefined) updateValues.section = input.section;
    if (input.jurisdiction !== undefined) updateValues.jurisdiction = input.jurisdiction;
    if (input.statutoryReference !== undefined) updateValues.statutoryReference = input.statutoryReference;
    if (input.timeframeDays !== undefined) updateValues.timeframeDays = input.timeframeDays;
    if (input.notes !== undefined) updateValues.notes = input.notes;
    if (input.dutyType !== undefined) updateValues.dutyType = input.dutyType;
    if (input.region !== undefined) updateValues.region = input.region;

    if (Object.keys(updateValues).length === 0) {
       const current = await db.selectFrom("obligation").selectAll().where("id", "=", input.id).executeTakeFirstOrThrow();
       return new Response(JSON.stringify({ obligation: current } satisfies OutputType));
    }

    const result = await db
      .updateTable("obligation")
      .set(updateValues)
      .where("id", "=", input.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    await logAudit({
      action: "SYSTEM_CHANGE",
      entityType: "OBLIGATION",
      entityId: result.id,
      userId: user.id,
      details: { description: result.description, section: result.section, jurisdiction: result.jurisdiction },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify({ obligation: result } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}