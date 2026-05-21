import { schema, OutputType } from "./delete_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { appendEvidenceEvent } from "../../helpers/evidenceEventLedger";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    // Fetch the evidence event to check ownership
    const evidenceEvent = await db
      .selectFrom("evidenceEvent")
      .selectAll()
      .where("id", "=", input.id)
      .executeTakeFirst();

    if (!evidenceEvent) {
      return new Response(JSON.stringify({ error: "Evidence event not found" }), { status: 404 });
    }

    if (user.role !== "admin") {
      if (evidenceEvent.packetId == null) {
        // Orphan events (no packetId) can only be deleted by admins
        return new Response(JSON.stringify({ error: "Only admins can delete evidence events without an associated packet" }), { status: 403 });
      }

      // Verify the associated packet belongs to this user
      const packet = await db
        .selectFrom("packet")
        .select(["id", "userId"])
        .where("id", "=", evidenceEvent.packetId)
        .executeTakeFirst();

      if (!packet) {
        return new Response(JSON.stringify({ error: "Associated packet not found" }), { status: 404 });
      }

      if (packet.userId !== user.id) {
        return new Response(JSON.stringify({ error: "You do not have permission to delete this evidence event" }), { status: 403 });
      }
    }

    const result = await db.transaction().execute((trx) =>
      appendEvidenceEvent({
        packetId: evidenceEvent.packetId,
        eventType: "EVIDENCE_EVENT_RETRACTED",
        description: `Retraction for evidence event #${input.id}: original event remains in the append-only ledger.`,
        statuteVersionId: evidenceEvent.statuteVersionId,
        organizationId: user.organizationId,
        region: evidenceEvent.region ?? "CA",
      }, trx),
    );

    console.log(`Evidence event retraction appended: originalId=${input.id}, retractionId=${result.id}, userId=${user.id}`);

    return new Response(JSON.stringify({
      success: true,
      event: result,
      originalEventId: input.id,
      appendOnly: true,
    } satisfies OutputType));
  } catch (error) {
    console.error("evidence/delete_POST error:", error instanceof Error ? error.message : error);
    return handleEndpointError(error);
  }
}
