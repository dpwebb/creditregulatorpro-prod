import { schema, OutputType } from "./scan_POST.schema";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { chain } from "../../helpers/hashChain";
import { deriveCronSecret } from "../../helpers/cronSecret";
import { CLOCK_SCAN_BATCH_LIMIT, CLOCK_SCAN_PACKET_STATUS } from "../../helpers/clockScanConfig";

const CRON_SECRET = deriveCronSecret("clock-scan-cron");

export async function handle(request: Request) {
  try {
    // 1. Authenticate via Bearer token.
    const authHeader = request.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7).trim()
      : null;

    if (!bearerToken || bearerToken !== CRON_SECRET) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid or missing token" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Query canonical generated packets in a bounded deterministic batch.
    const packets = await db
      .selectFrom("packet")
      .selectAll()
      .where("status", "=", CLOCK_SCAN_PACKET_STATUS)
      .orderBy("id", "asc")
      .limit(CLOCK_SCAN_BATCH_LIMIT)
      .execute();

    let packetsProcessed = 0;
    const now = new Date();

    for (const packet of packets) {
      // Check events
      const events = await db
        .selectFrom("evidenceEvent")
        .selectAll()
        .where("packetId", "=", packet.id)
        .orderBy("id", "desc") // Latest first
        .execute();

      const sentEvent = events.find(e => e.eventType === "SENT");
      const hasResponse = events.some(e => ["RESPONSE", "SILENCE", "LATE", "SILENCE_WINDOW_END"].includes(e.eventType));

      if (sentEvent && !hasResponse) {
        // Check clock - find the statute version for this packet
        let statuteVersion = null;
        if (packet.statuteVersionId) {
          statuteVersion = await db
            .selectFrom("statuteVersion")
            .select("responseClockDays")
            .where("id", "=", packet.statuteVersionId)
            .where("supersededDate", "is", null)
            .executeTakeFirst();
        }

        const clockDays = statuteVersion?.responseClockDays ?? 30; // Default 30 days if statute not found

        const sentDate = sentEvent.at ? new Date(sentEvent.at) : new Date();
        const deadline = new Date(sentDate);
        deadline.setDate(deadline.getDate() + clockDays);

        if (now > deadline) {
          // Time to mark silence
          const latestEvent = events[0]; // Since we ordered desc
          const previousHash = latestEvent.currentHash;
          const eventType = "SILENCE_WINDOW_END";

          const currentHash = chain(previousHash || undefined, {
            packetId: packet.id,
            eventType,
            at: now
          });

          await db
            .insertInto("evidenceEvent")
            .values({
              packetId: packet.id,
              eventType: eventType,
              at: now,
              region: "CA",
              previousHash: previousHash,
              currentHash: currentHash,
              description: "Response window expired"
            })
            .execute();

          packetsProcessed++;
          console.log(`clock/scan: inserted SILENCE_WINDOW_END for packet ${packet.id}`);
        }
      }
    }

    console.log(`clock/scan: processed ${packetsProcessed} packet(s) out of ${packets.length} ${CLOCK_SCAN_PACKET_STATUS} packet(s)`);

    return new Response(
      JSON.stringify({
        ok: true,
        packetsProcessed
      } satisfies OutputType),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}
