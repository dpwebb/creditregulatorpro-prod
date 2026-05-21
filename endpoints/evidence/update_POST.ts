import { schema, OutputType } from "./update_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { appendEvidenceEvent } from "../../helpers/evidenceEventLedger";
import { getServerUserSession } from "../../helpers/getServerUserSession";

function buildCorrectionDescription(
  originalId: number,
  updateData: Partial<{ eventType: string; description: string; statuteVersionId: number | null }>,
): string {
  const changes = Object.entries(updateData)
    .map(([key, value]) => `${key}: ${value == null ? "null" : String(value)}`)
    .join("; ");
  return `Correction for evidence event #${originalId}: ${changes}`;
}

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
        // Orphan events (no packetId) can only be modified by admins
        return new Response(JSON.stringify({ error: "Only admins can modify evidence events without an associated packet" }), { status: 403 });
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
        return new Response(JSON.stringify({ error: "You do not have permission to update this evidence event" }), { status: 403 });
      }
    }

    // Prepare update object with only defined fields
    const updateData: Partial<{
      eventType: string;
      description: string;
      statuteVersionId: number | null;
    }> = {};

    if (input.eventType !== undefined) updateData.eventType = input.eventType;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.statuteVersionId !== undefined) updateData.statuteVersionId = input.statuteVersionId;

    if (Object.keys(updateData).length === 0) {
      const current = await db
        .selectFrom("evidenceEvent")
        .selectAll()
        .where("id", "=", input.id)
        .executeTakeFirstOrThrow();
      return new Response(JSON.stringify({ event: current } satisfies OutputType));
    }

    const result = await db.transaction().execute((trx) =>
      appendEvidenceEvent({
        packetId: evidenceEvent.packetId,
        eventType: "EVIDENCE_EVENT_CORRECTED",
        description: buildCorrectionDescription(input.id, updateData),
        statuteVersionId: input.statuteVersionId !== undefined
          ? input.statuteVersionId
          : evidenceEvent.statuteVersionId,
        organizationId: user.organizationId,
        region: evidenceEvent.region ?? "CA",
      }, trx),
    );

    console.log(`Evidence event correction appended: originalId=${input.id}, correctionId=${result.id}, userId=${user.id}`);

    return new Response(JSON.stringify({
      event: result,
      originalEventId: input.id,
      appendOnly: true,
    } satisfies OutputType));
  } catch (error) {
    console.error("evidence/update_POST error:", error instanceof Error ? error.message : error);
    return handleEndpointError(error);
  }
}
