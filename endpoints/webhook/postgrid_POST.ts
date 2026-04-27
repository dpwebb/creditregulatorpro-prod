import { OutputType } from "./postgrid_POST.schema";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { JsonObject } from "../../helpers/schema";

function generateHash(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

function verifyPostGridSignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  // Header format: t=<timestamp>,v1=<signature>
  const parts = signatureHeader.split(',');
  let timestamp: string | null = null;
  let v1Signature: string | null = null;

  for (const part of parts) {
    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) continue;
    const key = part.substring(0, eqIndex).trim();
    const value = part.substring(eqIndex + 1).trim();
    if (key === 't') {
      timestamp = value;
    } else if (key === 'v1') {
      v1Signature = value;
    }
  }

  if (!timestamp) {
    console.warn("PostGrid webhook: No timestamp (t) found in signature header");
    return false;
  }

  if (!v1Signature) {
    console.warn("PostGrid webhook: No v1 signature found in header");
    return false;
  }

  // PostGrid signed payload format: "${timestamp}.${rawBody}"
  const signedPayload = `${timestamp}.${rawBody}`;

  const expectedSignature = createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks.
  // Both values are hex strings, so compare as hex buffers.
  try {
    const sigBuffer = Buffer.from(v1Signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch (e) {
    console.error("PostGrid webhook: Error during signature comparison:", e instanceof Error ? e.message : e);
    return false;
  }
}

export async function handle(request: Request) {
  try {
    // Read raw body text first (needed for both signature verification and JSON parsing)
    const text = await request.text();

    // --- Diagnostic header logging ---
    const signatureHeader = request.headers.get("x-postgrid-signature");
    const contentType = request.headers.get("content-type");
    console.log("PostGrid webhook: Incoming request headers —", {
      "x-postgrid-signature-present": signatureHeader !== null,
      "x-postgrid-signature-value": signatureHeader ? `${signatureHeader.substring(0, 20)}...` : null,
      "content-type": contentType,
    });

    // --- HMAC-SHA256 Signature Verification ---
    const webhookSecret = process.env.POSTGRID_WEBHOOK_SECRET;
    let signatureVerified = false;

    if (webhookSecret) {
      if (!signatureHeader) {
        console.warn("PostGrid webhook: Missing x-postgrid-signature header, rejecting request");
        return new Response(JSON.stringify({ error: "PostGrid webhook: Missing x-postgrid-signature header. Ensure PostGrid is configured with the correct webhook signing secret." }), { status: 401 });
      }

      const isValid = verifyPostGridSignature(text, signatureHeader, webhookSecret);
      if (!isValid) {
        console.warn("PostGrid webhook: Signature verification failed, rejecting request");
        return new Response(JSON.stringify({ error: "PostGrid webhook: Invalid signature. The computed HMAC-SHA256 signature does not match the value in the x-postgrid-signature header. Verify that POSTGRID_WEBHOOK_SECRET matches the secret configured in the PostGrid dashboard." }), { status: 401 });
      }

      signatureVerified = true;
      console.log("PostGrid webhook: Signature verified successfully");
    } else {
      console.warn("PostGrid webhook: POSTGRID_WEBHOOK_SECRET is not set — skipping signature verification (not recommended for production)");
    }
    // --- End Signature Verification ---

    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      return new Response("Invalid JSON", { status: 400 });
    }

    const letterId = json?.data?.id;
    const status = json?.data?.status;

    if (!letterId || !status) {
      // Return 200 OK so PostGrid stops retrying unprocessable payload shapes
      return new Response(JSON.stringify({ success: true } satisfies OutputType));
    }

    const packet = await db.selectFrom("packet")
      .select(["id", "status"])
      .where("postgridLetterId", "=", letterId)
      .executeTakeFirst();

    if (!packet) {
      return new Response(JSON.stringify({ success: true } satisfies OutputType));
    }

    let eventType = "PACKET_STATUS_UPDATED";
    if (status === "in_transit") eventType = "PACKET_IN_TRANSIT";
    else if (status === "delivered") eventType = "PACKET_DELIVERED";
    else if (status === "returned") eventType = "PACKET_RETURNED";

    // Reconstruct Hash Chain
    const lastEvent = await db.selectFrom("evidenceEvent")
      .select(["currentHash"])
      .where("packetId", "=", packet.id)
      .orderBy("at", "desc")
      .limit(1)
      .executeTakeFirst();

    const previousHash = lastEvent?.currentHash || null;

    const eventData = {
      packetId: packet.id,
      eventType,
      status,
      postgridLetterId: letterId,
      timestamp: new Date().toISOString(),
      previousHash
    };

    const currentHash = generateHash(JSON.stringify(eventData));

    const auditDetails: JsonObject = {
      postgridStatus: status,
      signatureVerified,
      signatureHeaderPresent: signatureHeader !== null,
    };

    // Update the system inside an ACID transaction
    await db.transaction().execute(async (trx) => {
      await trx.insertInto("evidenceEvent").values({
        packetId: packet.id,
        eventType,
        description: `PostGrid status updated to ${status}`,
        previousHash,
        currentHash,
        at: new Date(),
        region: "CA"
      }).execute();

      if (status === "delivered") {
        await trx.updateTable("packet").set({
          status: "DELIVERED"
        }).where("id", "=", packet.id).execute();
      }

      await trx.insertInto("auditLog").values({
        actionType: "UPDATE",
        entityType: "PACKET",
        entityId: packet.id,
        details: auditDetails,
        status: "SUCCESS",
        timestamp: new Date(),
        region: "CA"
      }).execute();
    });

    return new Response(JSON.stringify({ success: true } satisfies OutputType), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Webhook processing error:", error instanceof Error ? error.message : error);
    return new Response("Internal Server Error", { status: 500 });
  }
}