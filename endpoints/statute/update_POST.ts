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

    // Check if statute version exists
    const existing = await db
      .selectFrom("statuteVersion")
      .select("id")
      .where("id", "=", input.versionId)
      .executeTakeFirst();

    if (!existing) {
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
      // No updates requested, return existing with joined data
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
        .executeTakeFirstOrThrow();
      
      return new Response(JSON.stringify({ statute: current } satisfies OutputType));
    }

    // Update statute_version table
    const updatedVersion = await db
      .updateTable("statuteVersion")
      .set(updateValues)
      .where("id", "=", input.versionId)
      .returningAll()
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
      details: { versionId: input.versionId },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify({ statute: result } satisfies OutputType));
  } catch (error) {
    console.error("Error in statute/update_POST:", error);
    return handleEndpointError(error);
  }
}