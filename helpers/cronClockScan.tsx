import { db } from "./db";
import { chain } from "./hashChain";

export async function cronClockScan(): Promise<void> {
  console.log("Starting cronClockScan job...");
  try {
    const packets = await db
      .selectFrom("packet")
      .selectAll()
      .where("status", "=", "GENERATED")
      .execute();

    let packetsProcessed = 0;
    const now = new Date();

    for (const packet of packets) {
      const events = await db
        .selectFrom("evidenceEvent")
        .selectAll()
        .where("packetId", "=", packet.id)
        .orderBy("id", "desc")
        .execute();

      const sentEvent = events.find((e) => e.eventType === "SENT");
      const hasResponse = events.some((e) =>
        ["RESPONSE", "SILENCE", "LATE", "SILENCE_WINDOW_END"].includes(
          e.eventType
        )
      );

      if (sentEvent && !hasResponse) {
        let statuteVersion = null;
        if (packet.statuteVersionId) {
          statuteVersion = await db
            .selectFrom("statuteVersion")
            .select("responseClockDays")
            .where("id", "=", packet.statuteVersionId)
            .where("supersededDate", "is", null)
            .executeTakeFirst();
        }

        const clockDays = statuteVersion?.responseClockDays ?? 30;

        const sentDate = sentEvent.at ? new Date(sentEvent.at) : new Date();
        const deadline = new Date(sentDate);
        deadline.setDate(deadline.getDate() + clockDays);

        if (now > deadline) {
          const latestEvent = events[0];
          const previousHash = latestEvent?.currentHash || null;
          const eventType = "SILENCE_WINDOW_END";

          const currentHash = chain(previousHash || undefined, {
            packetId: packet.id,
            eventType,
            at: now,
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
              description: "Response window expired",
            })
            .execute();

          packetsProcessed++;
        }
      }
    }
    console.log(
      `cronClockScan completed. Processed ${packetsProcessed} packets.`
    );
  } catch (error) {
    console.error("cronClockScan failed:", error);
  }
}