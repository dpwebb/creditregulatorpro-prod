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
    const normalizedJurisdiction = input.jurisdiction.trim();
    const normalizedCode = input.code.trim().toUpperCase();

    // First, check if statute exists with given jurisdiction and code
    let statute = await db
      .selectFrom("statute")
      .selectAll()
      .where("jurisdiction", "=", normalizedJurisdiction)
      .where("code", "=", normalizedCode)
      .executeTakeFirst();

    // If statute doesn't exist, create it
    if (!statute) {
      statute = await db
        .insertInto("statute")
        .values({
          jurisdiction: normalizedJurisdiction,
          code: normalizedCode,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      
      console.log(`Created new statute: ${statute.id} for ${statute.jurisdiction} ${statute.code}`);
    }

    // Determine version if not provided - auto-increment based on max version for this statute_id
    let version = input.version;
    if (version === undefined || version === null) {
      const maxVersionResult = await db
        .selectFrom("statuteVersion")
        .select(db.fn.max("statuteVersion.version").as("maxVersion"))
        .where("statuteId", "=", statute.id)
        .executeTakeFirst();
      
      const currentMax = maxVersionResult?.maxVersion ?? 0;
      version = Number(currentMax) + 1;
    }

    // Check for duplicates (statute_id, version)
    const existing = await db
      .selectFrom("statuteVersion")
      .select("id")
      .where("statuteId", "=", statute.id)
      .where("version", "=", version)
      .executeTakeFirst();

    if (existing) {
      return new Response(JSON.stringify({ error: "A statute version with this version number already exists for this statute." }), { status: 409 });
    }

    // Insert into statute_version table with the statute_id
    const statuteVersion = await db
      .insertInto("statuteVersion")
      .values({
        statuteId: statute.id,
        version: version,
        description: input.description,
        responseClockDays: input.responseClockDays,
        effectiveDate: input.effectiveDate,
        sourceUrl: input.sourceUrl,
        sectionReference: input.sectionReference,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    console.log(`Created statute version: ${statuteVersion.id} version ${version} for statute ${statute.id}`);

    // Return combined data from both tables
    const result = {
      id: statute.id,
      jurisdiction: statute.jurisdiction,
      code: statute.code,
      versionId: statuteVersion.id,
      version: statuteVersion.version,
      description: statuteVersion.description,
      effectiveDate: statuteVersion.effectiveDate,
      supersededDate: statuteVersion.supersededDate,
      responseClockDays: statuteVersion.responseClockDays,
      sourceUrl: statuteVersion.sourceUrl,
      sectionReference: statuteVersion.sectionReference,
    };

    await logAudit({
      action: "SCHEMA_CHANGE",
      entityType: "STATUTE",
      entityId: statuteVersion.id,
      userId: user.id,
      details: {
        component: "statute",
        mode: "CREATE",
        statuteId: statute.id,
        versionId: statuteVersion.id,
        jurisdiction: statute.jurisdiction,
        code: statute.code,
        citation: `${statute.code} ${statuteVersion.sectionReference || ""}`.trim(),
        changedFields: [
          "jurisdiction",
          "code",
          "version",
          "description",
          "responseClockDays",
          "effectiveDate",
          "sourceUrl",
          "sectionReference",
        ],
        before: null,
        after: result,
      },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify({ statute: result } satisfies OutputType));
  } catch (error) {
    console.error("Error in statute/create_POST:", error);
    return handleEndpointError(error);
  }
}
