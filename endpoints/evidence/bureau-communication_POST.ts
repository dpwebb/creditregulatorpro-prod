import { schema, OutputType } from "./bureau-communication_POST.schema";
import { ObligationState } from "../../helpers/schema";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { checkRateLimit } from "../../helpers/rateLimiter";
import { logAudit } from "../../helpers/auditLogger";
import { chain } from "../../helpers/hashChain";
import CryptoJS from "crypto-js";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    // Rate limiting: 10 uploads/hour
    const rateLimit = await checkRateLimit(user.id.toString(), "BUREAU_COMMUNICATION_UPLOAD", 10, 60);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ error: "Upload limit reached. Please try again later." }), { status: 429 });
    }

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    // Validate existence of linked entities
    if (input.tradelineId) {
      const tradeline = await db.selectFrom("tradeline").select("id").where("id", "=", input.tradelineId).executeTakeFirst();
      if (!tradeline) throw new Error(`Tradeline with ID ${input.tradelineId} not found`);
    }
    if (input.packetId) {
      const packet = await db.selectFrom("packet").select("id").where("id", "=", input.packetId).executeTakeFirst();
      if (!packet) throw new Error(`Packet with ID ${input.packetId} not found`);
    }
    if (input.obligationInstanceId) {
      const obligation = await db.selectFrom("obligationInstance").select("id").where("id", "=", input.obligationInstanceId).executeTakeFirst();
      if (!obligation) throw new Error(`Obligation Instance with ID ${input.obligationInstanceId} not found`);
    }

    // Compute SHA-256 hash of the file content
    const fileHash = CryptoJS.SHA256(input.fileDataBase64).toString(CryptoJS.enc.Hex);
    
    // Calculate file size roughly from base64 string
    const fileSizeBytes = Math.ceil((input.fileDataBase64.length * 3) / 4) - (input.fileDataBase64.indexOf('=') > 0 ? (input.fileDataBase64.length - input.fileDataBase64.indexOf('=')) : 0);

    // Use a transaction to ensure atomicity and hash chain integrity
    const result = await db.transaction().execute(async (trx) => {
      // 1. Fetch the most recent evidence_event to get the previousHash
      // Lock the row to prevent race conditions in hash chaining
      const lastEvent = await trx
        .selectFrom("evidenceEvent")
        .select(["currentHash"])
        .orderBy("id", "desc")
        .limit(1)
        .forUpdate()
        .executeTakeFirst();

      const previousHash = lastEvent?.currentHash || "GENESIS";
      const timestamp = new Date();

      // 2. Compute the chain hash
      const currentHash = chain(previousHash, {
        fileHash,
        communicationType: input.communicationType,
        timestamp: timestamp.toISOString(),
        packetId: input.packetId,
        obligationInstanceId: input.obligationInstanceId,
        tradelineId: input.tradelineId
      });

      // 3. Create evidence_event record
      const evidenceEvent = await trx
        .insertInto("evidenceEvent")
        .values({
          eventType: input.communicationType,
          description: input.description || `Bureau Communication: ${input.communicationType}`,
          packetId: input.packetId ?? null,
          previousHash,
          currentHash,
          region: "CA",
          at: timestamp,
          organizationId: user.organizationId ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // 4. Create evidence_attachment record
      // We manually insert here instead of using uploadEvidence helper to ensure it's in the same transaction
      const evidenceAttachment = await trx
        .insertInto("evidenceAttachment")
        .values({
          obligationInstanceId: input.obligationInstanceId ?? null,
          packetId: input.packetId ?? null,
          fileName: input.fileName,
          fileType: input.fileType,
          fileSizeBytes,
          storageUrl: input.fileDataBase64, // Storing base64 directly as per requirements/existing patterns
          description: `Bureau Communication ${input.communicationType}. SHA256: ${fileHash}. ${input.description || ""}`.trim(),
          uploadedBy: user.id,
          region: "CA",
          uploadedAt: timestamp,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // 5. Update obligation instance state based on response
      let updatedObligationInstance = null;
      
      if (input.obligationInstanceId) {
        // Direct obligation instance provided
        const stateMapping: Record<string, ObligationState> = {
          "BUREAU_DENIAL": "INSUFFICIENT_RESPONSE",
          "BUREAU_VERIFICATION_REQUEST": "CHALLENGED",
          "BUREAU_CORRECTION_NOTICE": "INSUFFICIENT_RESPONSE",
          "BUREAU_RESPONSE_RECEIVED": "INSUFFICIENT_RESPONSE",
          "BUREAU_ACKNOWLEDGMENT": "CHALLENGED",
          "BUREAU_OTHER": "INSUFFICIENT_RESPONSE",
        };

        const newState = stateMapping[input.communicationType];
        
        updatedObligationInstance = await trx
          .updateTable("obligationInstance")
          .set({
            responseReceivedDate: timestamp,
            state: newState,
          })
          .where("id", "=", input.obligationInstanceId)
          .returningAll()
          .executeTakeFirst();

        console.log(`Updated obligation instance ${input.obligationInstanceId} to state ${newState} due to ${input.communicationType}`);
        
      } else if (input.tradelineId) {
        // No direct obligation instance, find most recent challenged one for the tradeline
        const pendingObligation = await trx
          .selectFrom("obligationInstance")
          .selectAll()
          .where("tradelineId", "=", input.tradelineId)
          .where("state", "=", "CHALLENGED")
          .orderBy("createdAt", "desc")
          .limit(1)
          .executeTakeFirst();

        if (pendingObligation) {
          const stateMapping: Record<string, ObligationState> = {
            "BUREAU_DENIAL": "INSUFFICIENT_RESPONSE",
            "BUREAU_VERIFICATION_REQUEST": "CHALLENGED",
            "BUREAU_CORRECTION_NOTICE": "INSUFFICIENT_RESPONSE",
            "BUREAU_RESPONSE_RECEIVED": "INSUFFICIENT_RESPONSE",
            "BUREAU_ACKNOWLEDGMENT": "CHALLENGED",
            "BUREAU_OTHER": "INSUFFICIENT_RESPONSE",
          };

          const newState = stateMapping[input.communicationType];
          
          updatedObligationInstance = await trx
            .updateTable("obligationInstance")
            .set({
              responseReceivedDate: timestamp,
              state: newState,
            })
            .where("id", "=", pendingObligation.id)
            .returningAll()
            .executeTakeFirst();

          console.log(`Auto-linked and updated obligation instance ${pendingObligation.id} for tradeline ${input.tradelineId} to state ${newState} due to ${input.communicationType}`);
        } else {
          console.log(`No pending obligation instance found for tradeline ${input.tradelineId}`);
        }
      }

      return { evidenceEvent, evidenceAttachment, updatedObligationInstance };
    });

    // Log audit event (outside transaction is fine, best effort)
    await logAudit({
      action: "RESPONSE_RECORDED",
      entityType: "EVIDENCE_EVENT",
      entityId: result.evidenceEvent.id,
      userId: user.id,
      details: {
        fileHash,
        communicationType: input.communicationType,
        fileName: input.fileName,
        linkedTo: {
          tradelineId: input.tradelineId,
          packetId: input.packetId,
          obligationInstanceId: input.obligationInstanceId
        }
      },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify({
      evidenceEvent: result.evidenceEvent,
      evidenceAttachment: result.evidenceAttachment,
      updatedObligationInstance: result.updatedObligationInstance || null,
      fileHash
    } satisfies OutputType));

  } catch (error) {
        return handleEndpointError(error);
  }
}