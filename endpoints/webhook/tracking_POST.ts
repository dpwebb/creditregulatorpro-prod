import { schema, OutputType } from "./tracking_POST.schema";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { chain } from "../../helpers/hashChain";

export async function handle(request: Request) {
  try {
    const webhookSecret = process.env.POSTGRID_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error("POSTGRID_WEBHOOK_SECRET environment variable is not set");
    }

    const authHeader = request.headers.get("Authorization");
    if (authHeader !== `Bearer ${webhookSecret}`) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    // 1. Fetch packet
    const packet = await db
      .selectFrom("packet")
      .select("id")
      .where("id", "=", input.packetId)
      .executeTakeFirst();

    if (!packet) {
      throw new Error(`Packet with ID ${input.packetId} not found`);
    }

    // 2. Get latest event for hash chain
    const latestEvent = await db
      .selectFrom("evidenceEvent")
      .select(["currentHash"])
      .where("packetId", "=", packet.id)
      .orderBy("id", "desc")
      .limit(1)
      .executeTakeFirst();

    const previousHash = latestEvent?.currentHash || null;

    // 3. Determine event type
    let eventType = "ACK";
    if (input.status === "RESPONDED") {
      eventType = "RESPONSE";
    }

    // 4. Compute new hash
    const now = new Date();
    const currentHash = chain(previousHash || undefined, {
      packetId: packet.id,
      status: input.status,
      payload: input.payload,
      at: now
    });

    // 5. Insert new event
    await db
      .insertInto("evidenceEvent")
      .values({
        packetId: packet.id,
        eventType: eventType,
        at: now,
        region: "CA",
        previousHash: previousHash,
        currentHash: currentHash,
        description: JSON.stringify(input.payload)
      })
      .execute();

    return new Response(
      JSON.stringify({ ok: true } satisfies OutputType),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    return handleEndpointError(error);
  }
}