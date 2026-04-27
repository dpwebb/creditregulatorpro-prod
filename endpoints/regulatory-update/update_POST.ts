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

    // Check if update exists
    const existing = await db
      .selectFrom("regulatoryUpdateLog")
      .select("id")
      .where("id", "=", input.id)
      .executeTakeFirst();

    if (!existing) {
      return new Response(JSON.stringify({ error: "Regulatory update not found" }), { status: 404 });
    }

    // Prepare update values
    const updateValues: Record<string, any> = {};
    
    // Allow updating all fields except id, jurisdiction, detected_at, created_at
    if (input.title !== undefined) updateValues.title = input.title;
    if (input.description !== undefined) updateValues.description = input.description;
    if (input.changeType !== undefined) updateValues.changeType = input.changeType;
    if (input.source !== undefined) updateValues.source = input.source;
    if (input.statutoryReference !== undefined) updateValues.statutoryReference = input.statutoryReference;
    if (input.effectiveDate !== undefined) updateValues.effectiveDate = input.effectiveDate;
    if (input.sourceUrl !== undefined) updateValues.sourceUrl = input.sourceUrl;
    if (input.impactAssessment !== undefined) updateValues.impactAssessment = input.impactAssessment;
    if (input.actionRequired !== undefined) updateValues.actionRequired = input.actionRequired;
    if (input.notes !== undefined) updateValues.notes = input.notes;
    if (input.status !== undefined) updateValues.status = input.status;
    if (input.reviewedAt !== undefined) updateValues.reviewedAt = input.reviewedAt;
    if (input.reviewedBy !== undefined) updateValues.reviewedBy = input.reviewedBy;
    if (input.appliedAt !== undefined) updateValues.appliedAt = input.appliedAt;

    if (Object.keys(updateValues).length === 0) {
      // No updates requested, return existing
      const current = await db
        .selectFrom("regulatoryUpdateLog")
        .selectAll()
        .where("id", "=", input.id)
        .executeTakeFirstOrThrow();
      
      return new Response(JSON.stringify({ update: current } satisfies OutputType));
    }

    // Update record
    const updatedUpdate = await db
      .updateTable("regulatoryUpdateLog")
      .set(updateValues)
      .where("id", "=", input.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    console.log(`Updated regulatory update: ${input.id}`);

    await logAudit({
      action: "SYSTEM_CHANGE",
      entityType: "REGULATORY_UPDATE",
      entityId: updatedUpdate.id,
      userId: user.id,
      details: { title: updatedUpdate.title, jurisdiction: updatedUpdate.jurisdiction, status: updatedUpdate.status },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify({ update: updatedUpdate } satisfies OutputType));
  } catch (error) {
    console.error("Error in regulatory-update/update_POST:", error);
    return handleEndpointError(error);
  }
}