import { schema, OutputType } from "./backfill-compliance_POST.schema";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { sql } from "kysely";


export async function handle(request: Request) {
  try {
    // 1. Auth Check: Admin only
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      console.warn(`Unauthorized admin endpoint access attempt by user ${user.id} (role: ${user.role}) on ${request.url}`);
      return new Response(
        JSON.stringify({ error: "Admin privileges required" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    // 2. Find target packets
    // We want packets that do NOT have a corresponding entry in packetComplianceAudit
    let query = db
      .selectFrom("packet")
      .leftJoin("packetComplianceAudit", "packet.id", "packetComplianceAudit.packetId")
      .select([
        "packet.id",
        "packet.tradelineId",
        "packet.statuteVersionId",
        "packet.createdAt",
        "packet.type",
        "packet.region"
      ])
      .where("packetComplianceAudit.id", "is", null);

    if (input.packetIds && input.packetIds.length > 0) {
      query = query.where("packet.id", "in", input.packetIds);
    }

    const packetsToBackfill = await query.execute();

    console.log(`Found ${packetsToBackfill.length} packets to backfill compliance data.`);

    let processedPackets = 0;
    let recordsCreated = 0;
    const errors: string[] = [];

    // 3. Process each packet
    for (const packet of packetsToBackfill) {
      try {
        processedPackets++;

        if (!packet.tradelineId) {
          errors.push(`Packet ${packet.id}: Missing tradelineId`);
          continue;
        }

        // A. Find the related Obligation
        // We try to match the packet type to the obligation type for the same tradeline
        let obligationId: number | null = null;

        if (packet.type) {
          const matchingObligation = await db
            .selectFrom("obligationInstance")
            .innerJoin("obligation", "obligation.id", "obligationInstance.obligationId")
            .select("obligation.id")
            .where("obligationInstance.tradelineId", "=", packet.tradelineId)
            .where("obligation.obligationType", "=", packet.type)
            .limit(1)
            .executeTakeFirst();
          
          if (matchingObligation) {
            obligationId = matchingObligation.id;
          }
        }

        // Fallback: if no type match, just grab the most recent obligation instance for this tradeline created before the packet
        if (!obligationId) {
          const fallbackObligation = await db
            .selectFrom("obligationInstance")
            .innerJoin("obligation", "obligation.id", "obligationInstance.obligationId")
            .select("obligation.id")
            .where("obligationInstance.tradelineId", "=", packet.tradelineId)
            // If packet.createdAt is null, we can't compare time, so just ignore time constraint
            .$if(!!packet.createdAt, (qb) => 
              qb.where("obligationInstance.createdAt", "<=", packet.createdAt!)
            )
            .orderBy("obligationInstance.createdAt", "desc")
            .limit(1)
            .executeTakeFirst();

          if (fallbackObligation) {
            obligationId = fallbackObligation.id;
          }
        }

        if (!obligationId) {
          errors.push(`Packet ${packet.id}: Could not find related obligation for tradeline ${packet.tradelineId}`);
          continue;
        }

        // B. Find the earliest Evidence Event
        const evidenceEvent = await db
          .selectFrom("evidenceEvent")
          .select("id")
          .where("packetId", "=", packet.id)
          .orderBy("at", "asc")
          .limit(1)
          .executeTakeFirst();

        // C. Create Compliance Audit Record
        await db
          .insertInto("packetComplianceAudit")
          .values({
            packetId: packet.id,
            obligationId: obligationId,
            statuteVersionId: packet.statuteVersionId, // Can be null, which is allowed by schema if not enforced, but let's check schema types. 
            // Looking at schema.ts: statuteVersionId: number | null; So it is nullable in interface.
            // However, in DB it might be nullable.
            appliedAt: packet.createdAt,
            evidenceEventId: evidenceEvent?.id ?? null,
            complianceStatus: "APPLIED",
            selectionReason: "Backfilled from historical packet data",
            regulationType: "STATUTE",
            region: packet.region || "CA"
          })
          .execute();

        recordsCreated++;

      } catch (innerError) {
        console.error(`Error processing packet ${packet.id}:`, innerError);
        errors.push(`Packet ${packet.id}: ${innerError instanceof Error ? innerError.message : "Unknown error"}`);
      }
    }

    // 4. Legacy DocStrange reparse is intentionally disabled. Backfill may repair
    // packet compliance audit rows, but it must not update tradelines from
    // DocStrange-shaped HTML or AI-adjacent artifacts.

    const artifactsWithHtml = await db
      .selectFrom("reportArtifact")
      .select("id")
      .where(sql`data->>'docstrangeRawHtml'`, "is not", null)
      .execute();

    console.log(
      `[BackfillCompliance] Legacy DocStrange reparse disabled; skipped ${artifactsWithHtml.length} artifact(s).`,
    );

    return new Response(
      JSON.stringify({
        processedPackets,
        recordsCreated,
        errors,
        reparsedArtifacts: 0,
        tradelinesUpdated: 0,
        legacyDocStrangeReparseDisabled: true,
        legacyDocStrangeArtifactsSkipped: artifactsWithHtml.length,
      } satisfies OutputType),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in admin/backfill-compliance_POST:", error);
    return handleEndpointError(error);
  }
}
