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

    // Check if the statute version exists
    const statuteVersion = await db
      .selectFrom("statuteVersion")
      .innerJoin("statute", "statute.id", "statuteVersion.statuteId")
      .select([
        "statuteVersion.id",
        "statuteVersion.statuteId",
        "statute.jurisdiction",
        "statute.code",
        "statuteVersion.version",
        "statuteVersion.sectionReference",
      ])
      .where("id", "=", input.versionId)
      .executeTakeFirst();

    if (!statuteVersion) {
      return new Response(JSON.stringify({ error: "Statute version not found" }), { status: 404 });
    }

    // Check for references in packet table (using statute_version_id)
    const packetRef = await db
      .selectFrom("packet")
      .select("id")
      .where("statuteVersionId", "=", input.versionId)
      .executeTakeFirst();

    if (packetRef) {
      return new Response(JSON.stringify({ error: "Cannot delete statute version that is referenced in packets. Consider marking it as superseded instead." }), { status: 400 });
    }

    // Check for references in evidence_event table (using statute_version_id)
    const evidenceRef = await db
      .selectFrom("evidenceEvent")
      .select("id")
      .where("statuteVersionId", "=", input.versionId)
      .executeTakeFirst();

    if (evidenceRef) {
      return new Response(JSON.stringify({ error: "Cannot delete statute version that is referenced in evidence events. Consider marking it as superseded instead." }), { status: 400 });
    }

    // Check if this is the last version for this statute
    const versionCount = await db
      .selectFrom("statuteVersion")
      .select(db.fn.count("id").as("count"))
      .where("statuteId", "=", statuteVersion.statuteId)
      .executeTakeFirstOrThrow();

    const count = Number(versionCount.count);

    if (count === 1) {
      // This is the last version, delete the statute (cascade will delete the version)
      const result = await db
        .deleteFrom("statute")
        .where("id", "=", statuteVersion.statuteId)
        .executeTakeFirst();

      if (Number(result.numDeletedRows) === 0) {
        return new Response(JSON.stringify({ error: "Failed to delete statute" }), { status: 500 });
      }
      
      console.log(`Deleted statute ${statuteVersion.statuteId} (last version deleted)`);
    } else {
      // Delete only this version
      const result = await db
        .deleteFrom("statuteVersion")
        .where("id", "=", input.versionId)
        .executeTakeFirst();

      if (Number(result.numDeletedRows) === 0) {
        return new Response(JSON.stringify({ error: "Failed to delete statute version" }), { status: 500 });
      }
      
      console.log(`Deleted statute version ${input.versionId}`);
    }

    await logAudit({
      action: "SCHEMA_CHANGE",
      entityType: "STATUTE",
      entityId: input.versionId,
      userId: user.id,
      details: {
        component: "statute",
        mode: "DELETE",
        versionId: input.versionId,
        statuteId: statuteVersion.statuteId,
        jurisdiction: statuteVersion.jurisdiction,
        code: statuteVersion.code,
        version: statuteVersion.version,
        citation: `${statuteVersion.code} ${statuteVersion.sectionReference || ""}`.trim(),
      },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify({ success: true } satisfies OutputType));
  } catch (error) {
    console.error("Error in statute/delete_POST:", error);
    return handleEndpointError(error);
  }
}
