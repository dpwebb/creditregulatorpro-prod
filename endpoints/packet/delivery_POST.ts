import { schema, OutputType } from "./delivery_POST.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { createHash } from "crypto";
import { calculateDeadline, createDeadlineEvent } from "../../helpers/deadlineCalculator";

const INTEGRITY_BLOCK_MESSAGE = "Transmission blocked: system integrity check failed. All conditions must be met before submission.";

function generateHash(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

export async function handle(request: Request) {
  try {
    const session = await getServerUserSession(request);
    const userId = session.user.id;

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    // System integrity checks (before any other processing)
    // 1. userReviewed and userApproved must be true (enforced by schema literal, but double-check)
    if (input.userReviewed !== true || input.userApproved !== true) {
      console.warn(`Integrity check failed: userReviewed=${input.userReviewed}, userApproved=${input.userApproved} for userId=${userId}`);
      return new Response(JSON.stringify({ error: INTEGRITY_BLOCK_MESSAGE }), { status: 403 });
    }

    // 2. consent_active: user must have accepted terms
    const userAccount = await db
      .selectFrom("userAccount")
            .select(["termsAcceptedAt"])
      .where("userId", "=", userId)
      .executeTakeFirst();

    const consentActive = userAccount?.termsAcceptedAt != null;
    if (!consentActive) {
      console.warn(`Integrity check failed: termsAcceptedAt is null for userId=${userId}`);
      return new Response(JSON.stringify({ error: INTEGRITY_BLOCK_MESSAGE }), { status: 403 });
    }

    // 3. representation_flag = false (CRP never represents — hardcoded)
    const representationFlag = false;
    if (representationFlag) {
      console.warn(`Integrity check failed: representationFlag is true for userId=${userId}`);
      return new Response(JSON.stringify({ error: INTEGRITY_BLOCK_MESSAGE }), { status: 403 });
    }

    // Verify user owns the packet
    const packet = await db
      .selectFrom("packet")
      .innerJoin("tradeline", "packet.tradelineId", "tradeline.id")
      .select([
        "packet.id",
        "packet.tradelineId",
        "tradeline.userId",
        "packet.status"
      ])
      .where("packet.id", "=", input.packetId)
      .executeTakeFirst();

    if (!packet) {
      return new Response(JSON.stringify({ error: "Packet not found" }), { status: 404 });
    }

    if (packet.userId !== userId) {
      return new Response(JSON.stringify({ error: "Unauthorized access to packet" }), { status: 403 });
    }

    // Calculate the response deadline: sentDate + 30 days
    const { deadline: responseDeadline } = calculateDeadline(input.sentDate, "CA", false);

    // Run the main transaction: update packet and create evidence/audit events.
    // Legacy dispute workflow instance creation is reset.
    let newObligationInstanceId: number | null = null;

    await db.transaction().execute(async (trx) => {
      const letterDate = input.letterDate || input.sentDate;

      // Update packet
      await trx
        .updateTable("packet")
        .set({
          deliveryMethod: input.deliveryMethod,
          trackingNumber: input.trackingNumber || null,
          sentDate: input.sentDate,
          consumerCertification: input.consumerCertification,
          letterDate: letterDate,
          status: "SENT",
        })
        .where("id", "=", input.packetId)
        .execute();

      // Get the latest evidence event for this packet to link the hash chain
      const lastEvent = await trx
        .selectFrom("evidenceEvent")
        .select(["currentHash"])
        .where("packetId", "=", input.packetId)
        .orderBy("at", "desc")
        .limit(1)
        .executeTakeFirst();

      const previousHash = lastEvent?.currentHash || null;

      // Construct data for hashing
      const eventData = {
        packetId: input.packetId,
        eventType: "PACKET_SENT",
        deliveryMethod: input.deliveryMethod,
        trackingNumber: input.trackingNumber,
        sentDate: input.sentDate.toISOString(),
        timestamp: new Date().toISOString(),
        previousHash
      };

      const currentHash = generateHash(JSON.stringify(eventData));
      const description = `Packet sent via ${input.deliveryMethod}${input.trackingNumber ? ` (Tracking: ${input.trackingNumber})` : ''}`;

      // Create Evidence Event
      await trx
        .insertInto("evidenceEvent")
        .values({
          packetId: input.packetId,
          eventType: "PACKET_SENT",
          description: description,
          previousHash: previousHash,
          currentHash: currentHash,
          at: new Date(),
          region: "CA"
        })
        .execute();

      // Audit log
      await trx
        .insertInto("auditLog")
        .values({
          actionType: "UPDATE",
          entityType: "PACKET",
          entityId: input.packetId,
          userId: userId,
                    details: {
            field: "delivery_info",
            method: input.deliveryMethod,
            tracking: input.trackingNumber
          } as any,
          status: "SUCCESS",
          timestamp: new Date()
        })
        .execute();

      console.log(`Delivery recorded for packet ${input.packetId}; dispute workflow instance creation is reset.`);
    });

    // Create deadline event OUTSIDE the transaction (createDeadlineEvent does its own insert)
    const sentDateFormatted = input.sentDate.toLocaleDateString("en-CA");
    let deadlineEventId: number | undefined;
    let deadlineWarning: string | undefined;

    try {
      const deadlineEventRecord = await createDeadlineEvent({
        obligationInstanceId: newObligationInstanceId ?? undefined,
        packetId: input.packetId,
        eventType: "BUREAU_RESPONSE_DEADLINE",
        deadline: responseDeadline,
        title: "Bureau Response Due",
        description: `30-day statutory response deadline for packet sent via ${input.deliveryMethod} on ${sentDateFormatted}`,
        region: "CA",
      });
      deadlineEventId = deadlineEventRecord.id;
      console.log(`Created deadlineEvent id=${deadlineEventId} for obligationInstance ${newObligationInstanceId}`);
    } catch (deadlineError) {
      console.error(`Failed to create deadlineEvent for packet ${input.packetId} (obligationInstance ${newObligationInstanceId}):`, deadlineError);
      deadlineWarning = "Packet delivery was recorded successfully, but the 30-day response deadline reminder could not be created. Please contact support.";
    }

    return new Response(JSON.stringify({
      success: true,
      packetId: input.packetId,
      message: "Packet delivery information recorded successfully",
      obligationInstanceId: newObligationInstanceId ?? undefined,
      deadlineEventId,
      ...(deadlineWarning ? { deadlineWarning } : {}),
    } satisfies OutputType));

  } catch (error) {
    console.error("Error recording packet delivery:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return new Response(JSON.stringify({ error: error.message }), { status: 401 });
      }
    }

    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error occurred" }), { status: 400 });
  }
}
