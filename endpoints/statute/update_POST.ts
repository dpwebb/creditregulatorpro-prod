import { schema, OutputType } from "./update_POST.schema";

import { db } from "../../helpers/db";
import { BusinessRuleError, handleEndpointError } from "../../helpers/endpointErrorHandler";
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

    // Check if statute version exists and load current row
    const current = await db
      .selectFrom("statuteVersion")
      .innerJoin("statute", "statute.id", "statuteVersion.statuteId")
      .select([
        "statute.id",
        "statute.jurisdiction",
        "statute.code",
        "statuteVersion.id as versionId",
        "statuteVersion.version",
        "statuteVersion.description",
        "statuteVersion.effectiveDate",
        "statuteVersion.supersededDate",
        "statuteVersion.responseClockDays",
        "statuteVersion.sourceUrl",
        "statuteVersion.sectionReference",
      ])
      .where("statuteVersion.id", "=", input.versionId)
      .executeTakeFirst();

    if (!current) {
      return new Response(JSON.stringify({ error: "Statute version not found" }), { status: 404 });
    }

    // Prepare update values for statute_version table, filtering out undefined
    const updateValues: Record<string, any> = {};
    if (input.description !== undefined) updateValues.description = input.description;
    if (input.responseClockDays !== undefined) updateValues.responseClockDays = input.responseClockDays;
    if (input.effectiveDate !== undefined) updateValues.effectiveDate = input.effectiveDate;
    if (input.supersededDate !== undefined) updateValues.supersededDate = input.supersededDate;
    if (input.sourceUrl !== undefined) updateValues.sourceUrl = input.sourceUrl;
    if (input.sectionReference !== undefined) updateValues.sectionReference = input.sectionReference;

    if (Object.keys(updateValues).length === 0) {
      if (input.markReviewed) {
        await logAudit({
          action: "READ",
          entityType: "STATUTE",
          entityId: input.versionId,
          userId: user.id,
          details: {
            component: "statute",
            mode: "REVIEWED",
            versionId: input.versionId,
            statuteId: current.id,
          },
          status: "SUCCESS",
          request,
        });
      }
      return new Response(JSON.stringify({ statute: current } satisfies OutputType));
    }

    const nextSnapshot = {
      description: updateValues.description !== undefined ? updateValues.description : current.description,
      effectiveDate: updateValues.effectiveDate !== undefined ? updateValues.effectiveDate : current.effectiveDate,
      sourceUrl: updateValues.sourceUrl !== undefined ? updateValues.sourceUrl : current.sourceUrl,
      sectionReference:
        updateValues.sectionReference !== undefined ? updateValues.sectionReference : current.sectionReference,
      supersededDate:
        updateValues.supersededDate !== undefined ? updateValues.supersededDate : current.supersededDate,
    };

    const isOrWillBeActive = !nextSnapshot.supersededDate;
    if (isOrWillBeActive) {
      if (!nextSnapshot.description || !nextSnapshot.description.trim()) {
        throw new BusinessRuleError("Active law versions must include a description.");
      }
      if (!nextSnapshot.sourceUrl || !nextSnapshot.sourceUrl.trim()) {
        throw new BusinessRuleError("Active law versions must include an official source URL.");
      }
      if (!nextSnapshot.sectionReference || !nextSnapshot.sectionReference.trim()) {
        throw new BusinessRuleError("Active law versions must include a section reference/citation.");
      }
      if (!nextSnapshot.effectiveDate) {
        throw new BusinessRuleError("Active law versions must include an effective date.");
      }
    }

    // Update statute_version table
    await db
      .updateTable("statuteVersion")
      .set(updateValues)
      .where("id", "=", input.versionId)
      .executeTakeFirstOrThrow();

    // Get the combined data from both tables
    const result = await db
      .selectFrom("statuteVersion")
      .innerJoin("statute", "statute.id", "statuteVersion.statuteId")
      .select([
        "statute.id",
        "statute.jurisdiction",
        "statute.code",
        "statuteVersion.id as versionId",
        "statuteVersion.version",
        "statuteVersion.description",
        "statuteVersion.effectiveDate",
        "statuteVersion.supersededDate",
        "statuteVersion.responseClockDays",
        "statuteVersion.sourceUrl",
        "statuteVersion.sectionReference",
      ])
      .where("statuteVersion.id", "=", input.versionId)
      .executeTakeFirstOrThrow();

    console.log(`Updated statute version: ${input.versionId}`);

    await logAudit({
      action: "SCHEMA_CHANGE",
      entityType: "STATUTE",
      entityId: input.versionId,
      userId: user.id,
      details: {
        component: "statute",
        mode: "UPDATE",
        statuteId: result.id,
        versionId: input.versionId,
        citation: `${result.code} ${result.sectionReference || ""}`.trim(),
        changedFields: Object.keys(updateValues),
        before: current,
        after: result,
      },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify({ statute: result } satisfies OutputType));
  } catch (error) {
    console.error("Error in statute/update_POST:", error);
    return handleEndpointError(error);
  }
}
