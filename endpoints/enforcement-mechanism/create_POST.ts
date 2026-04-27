import { schema, OutputType } from "./create_POST.schema";

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

    // Create new enforcement mechanism
    // Enforce region = 'CA' per policy
    const newMechanism = await db
      .insertInto("enforcementMechanism")
      .values({
        jurisdiction: input.jurisdiction,
        mechanismType: input.mechanismType,
        name: input.name,
        description: input.description,
        statutoryReference: input.statutoryReference ?? null,
        penaltyAmount: input.penaltyAmount ?? null,
        contactInfo: input.contactInfo ?? null,
        websiteUrl: input.websiteUrl ?? null,
        filingDeadlineDays: input.filingDeadlineDays ?? null,
        notes: input.notes ?? null,
        region: "CA",
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    console.log(`Created enforcement mechanism: ${newMechanism.id}`);

    await logAudit({
      action: "SYSTEM_CHANGE",
      entityType: "ENFORCEMENT_MECHANISM",
      entityId: newMechanism.id,
      userId: user.id,
      details: { name: newMechanism.name, jurisdiction: newMechanism.jurisdiction, mechanismType: newMechanism.mechanismType },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify({ mechanism: newMechanism } satisfies OutputType));
  } catch (error) {
    console.error("Error in enforcement-mechanism/create_POST:", error);
    return handleEndpointError(error);
  }
}