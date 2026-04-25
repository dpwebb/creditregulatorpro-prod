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

    // Check if mechanism exists
    const existing = await db
      .selectFrom("enforcementMechanism")
      .select("id")
      .where("id", "=", input.id)
      .executeTakeFirst();

    if (!existing) {
      return new Response(JSON.stringify({ error: "Enforcement mechanism not found" }), { status: 404 });
    }

    // Prepare update values
    const updateValues: Record<string, any> = {};
    if (input.name !== undefined) updateValues.name = input.name;
    if (input.description !== undefined) updateValues.description = input.description;
    if (input.statutoryReference !== undefined) updateValues.statutoryReference = input.statutoryReference;
    if (input.penaltyAmount !== undefined) updateValues.penaltyAmount = input.penaltyAmount;
    if (input.contactInfo !== undefined) updateValues.contactInfo = input.contactInfo;
    if (input.websiteUrl !== undefined) updateValues.websiteUrl = input.websiteUrl;
    if (input.filingDeadlineDays !== undefined) updateValues.filingDeadlineDays = input.filingDeadlineDays;
    if (input.notes !== undefined) updateValues.notes = input.notes;

    if (Object.keys(updateValues).length === 0) {
      // No updates requested, return existing
      const current = await db
        .selectFrom("enforcementMechanism")
        .selectAll()
        .where("id", "=", input.id)
        .executeTakeFirstOrThrow();
      
      return new Response(JSON.stringify({ mechanism: current } satisfies OutputType));
    }

    // Update mechanism
    const updatedMechanism = await db
      .updateTable("enforcementMechanism")
      .set(updateValues)
      .where("id", "=", input.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    console.log(`Updated enforcement mechanism: ${input.id}`);

    await logAudit({
      action: "SYSTEM_CHANGE",
      entityType: "ENFORCEMENT_MECHANISM",
      entityId: updatedMechanism.id,
      userId: user.id,
      details: { name: updatedMechanism.name, jurisdiction: updatedMechanism.jurisdiction, mechanismType: updatedMechanism.mechanismType },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify({ mechanism: updatedMechanism } satisfies OutputType));
  } catch (error) {
    console.error("Error in enforcement-mechanism/update_POST:", error);
    return handleEndpointError(error);
  }
}