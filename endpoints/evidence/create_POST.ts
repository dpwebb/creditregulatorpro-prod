import { schema, OutputType } from "./create_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    // If packetId is provided, verify the packet belongs to this user (unless admin)
    if (input.packetId != null) {
      const packet = await db
        .selectFrom("packet")
        .select(["id", "userId"])
        .where("id", "=", input.packetId)
        .executeTakeFirst();

      if (!packet) {
        return new Response(JSON.stringify({ error: "Packet not found" }), { status: 404 });
      }

      if (user.role !== "admin" && packet.userId !== user.id) {
        return new Response(JSON.stringify({ error: "You do not have permission to create evidence for this packet" }), { status: 403 });
      }
    }

    const result = await db
      .insertInto("evidenceEvent")
      .values({
        packetId: input.packetId,
        eventType: input.eventType,
        description: input.description,
        statuteVersionId: input.statuteVersionId,
        previousHash: input.previousHash,
        currentHash: input.currentHash,
        organizationId: user.organizationId,
        region: "CA", // Enforce CA region
        at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    console.log(`Evidence event created: id=${result.id}, packetId=${result.packetId}, userId=${user.id}`);

    return new Response(JSON.stringify({ event: result } satisfies OutputType));
  } catch (error) {
    console.error("evidence/create_POST error:", error instanceof Error ? error.message : error);
    return handleEndpointError(error);
  }
}