import { schema } from "./bureau-communication_POST.schema";
import type { InputType, OutputType } from "./bureau-communication_POST.schema";
import type { Json } from "../../helpers/schema";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { checkRateLimit } from "../../helpers/rateLimiter";
import { logAudit } from "../../helpers/auditLogger";
import { chain } from "../../helpers/hashChain";
import { runAllResponseAuditDetectors } from "../../helpers/complianceDetectorResponse";
import {
  classifyBureauResponse,
  type BureauResponseClassification,
} from "../../helpers/bureauResponseClassifier";
import {
  BUREAU_COMMUNICATION_UPLOAD_MAX_BYTES,
  getBase64DecodedByteLength,
  isUploadRequestContentLengthTooLarge,
  isUploadRequestTextTooLarge,
  uploadRequestTooLargeResponse,
} from "../../helpers/uploadPayloadValidation";
import CryptoJS from "crypto-js";

function toJsonArray(value: string[] | undefined): Json | undefined {
  return value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as Json);
}

function hasResponseMetadata(input: InputType) {
  return [
    input.responseStatus,
    input.responseLetterContent,
    input.responseMovDisclosed,
    input.responseMovDescription,
    input.responseItemsDisputed,
    input.responseItemsAddressed,
    input.responseDocumentationProvided,
    input.responseDocumentationTypes,
    input.responseSenderAddress,
    input.responseAuthorizedSignature,
    input.responseSignatoryName,
    input.responseSignatoryTitle,
  ].some((value) => value !== undefined);
}

function buildObligationUpdate(
  input: InputType,
  timestamp: Date,
  currentInstance: Record<string, any> | null
): { updateData: Record<string, any>; classification: BureauResponseClassification } {
  const classification = classifyBureauResponse({
    communicationType: input.communicationType,
    responseStatus: input.responseStatus,
    responseLetterContent: input.responseLetterContent,
    description: input.description,
    responseMovDisclosed: input.responseMovDisclosed,
    responseMovDescription: input.responseMovDescription,
    responseDocumentationProvided: input.responseDocumentationProvided,
    responseDocumentationTypes: input.responseDocumentationTypes,
    responseItemsDisputed: input.responseItemsDisputed,
    responseItemsAddressed: input.responseItemsAddressed,
    responseReceivedDate: timestamp,
    responseDeadline: currentInstance?.responseDeadline ?? null,
  });

  const updateData: Record<string, any> = {
    state: classification.obligationState,
    responseStatus: classification.responseStatus,
  };

  if (classification.responseReceived) {
    updateData.responseReceivedDate = timestamp;
    if (input.responseLetterContent !== undefined || input.description) {
      updateData.responseLetterContent = input.responseLetterContent ?? input.description ?? null;
    }
  }

  if (classification.successOutcome) {
    updateData.successOutcome = classification.successOutcome;
  }

  const optionalFields: Array<[string, unknown]> = [
    ["responseMovDisclosed", input.responseMovDisclosed],
    ["responseMovDescription", input.responseMovDescription],
    ["responseDocumentationProvided", input.responseDocumentationProvided],
    ["responseSenderAddress", input.responseSenderAddress],
    ["responseAuthorizedSignature", input.responseAuthorizedSignature],
    ["responseSignatoryName", input.responseSignatoryName],
    ["responseSignatoryTitle", input.responseSignatoryTitle],
  ];

  for (const [key, value] of optionalFields) {
    if (value !== undefined) updateData[key] = value;
  }

  const disputed = toJsonArray(input.responseItemsDisputed);
  if (disputed !== undefined) updateData.responseItemsDisputed = disputed;

  const addressed = toJsonArray(input.responseItemsAddressed);
  if (addressed !== undefined) updateData.responseItemsAddressed = addressed;

  const docTypes = toJsonArray(input.responseDocumentationTypes);
  if (docTypes !== undefined) updateData.responseDocumentationTypes = docTypes;

  const shouldAudit =
    input.runAudit === true ||
    (input.runAudit !== false && classification.responseReceived && (hasResponseMetadata(input) || input.description));

  if (shouldAudit && currentInstance) {
    const instanceForAudit = {
      ...currentInstance,
      ...updateData,
      responseItemsDisputed: input.responseItemsDisputed ?? currentInstance.responseItemsDisputed,
      responseItemsAddressed: input.responseItemsAddressed ?? currentInstance.responseItemsAddressed,
      responseDocumentationTypes: input.responseDocumentationTypes ?? currentInstance.responseDocumentationTypes,
    };
    const auditFindings = runAllResponseAuditDetectors([instanceForAudit as any]);
    updateData.responseAuditFindings = JSON.parse(JSON.stringify(auditFindings)) as Json;
    updateData.responseAuditCompletedAt = timestamp;
  }

  return { updateData, classification };
}

function buildPacketUpdate(classification: BureauResponseClassification, timestamp: Date): Record<string, any> | null {
  if (!classification.responseReceived) return null;

  const updateData: Record<string, any> = {
    bureauResponseDate: timestamp,
    responseType: classification.responseType,
  };

  if (classification.successOutcome) {
    updateData.successOutcome = classification.successOutcome;
  }

  return updateData;
}

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    // Rate limiting: 10 uploads/hour
    const rateLimit = await checkRateLimit(user.id.toString(), "BUREAU_COMMUNICATION_UPLOAD", 10, 60);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ error: "Upload limit reached. Please try again later." }), { status: 429 });
    }

    if (isUploadRequestContentLengthTooLarge(request, BUREAU_COMMUNICATION_UPLOAD_MAX_BYTES)) {
      return uploadRequestTooLargeResponse("Bureau communication", BUREAU_COMMUNICATION_UPLOAD_MAX_BYTES);
    }

    const text = await request.text();
    if (isUploadRequestTextTooLarge(text, BUREAU_COMMUNICATION_UPLOAD_MAX_BYTES)) {
      return uploadRequestTooLargeResponse("Bureau communication", BUREAU_COMMUNICATION_UPLOAD_MAX_BYTES);
    }

    const json = JSON.parse(text);
    const input = schema.parse(json);

    const isAdmin = user.role === "admin";
    const linkedTradelineIds: number[] = [];
    let packetTradelineId: number | null = null;
    let obligationTradelineId: number | null = null;

    // Validate existence and ownership of linked entities
    if (input.tradelineId) {
      const tradeline = await db
        .selectFrom("tradeline")
        .select(["id", "userId", "organizationId"])
        .where("id", "=", input.tradelineId)
        .executeTakeFirst();
      if (!tradeline) throw new Error(`Tradeline with ID ${input.tradelineId} not found`);
      if (!isAdmin && tradeline.userId !== user.id) {
        return new Response(JSON.stringify({ error: "Access denied: this tradeline does not belong to you." }), { status: 403 });
      }
      linkedTradelineIds.push(tradeline.id);
    }
    if (input.packetId) {
      const packet = await db
        .selectFrom("packet")
        .leftJoin("tradeline", "tradeline.id", "packet.tradelineId")
        .select([
          "packet.id",
          "packet.userId",
          "packet.organizationId",
          "packet.tradelineId",
          "tradeline.userId as tradelineUserId",
        ])
        .where("packet.id", "=", input.packetId)
        .executeTakeFirst();
      if (!packet) throw new Error(`Packet with ID ${input.packetId} not found`);
      const packetOwnerId = packet.userId ?? packet.tradelineUserId;
      if (!isAdmin && packetOwnerId !== user.id) {
        return new Response(JSON.stringify({ error: "Access denied: this packet does not belong to you." }), { status: 403 });
      }
      packetTradelineId = packet.tradelineId;
      if (packet.tradelineId !== null) linkedTradelineIds.push(packet.tradelineId);
    }
    if (input.obligationInstanceId) {
      const obligation = await db
        .selectFrom("obligationInstance")
        .leftJoin("tradeline", "tradeline.id", "obligationInstance.tradelineId")
        .select([
          "obligationInstance.id",
          "obligationInstance.userId",
          "obligationInstance.organizationId",
          "obligationInstance.tradelineId",
          "tradeline.userId as tradelineUserId",
        ])
        .where("obligationInstance.id", "=", input.obligationInstanceId)
        .executeTakeFirst();
      if (!obligation) throw new Error(`Obligation Instance with ID ${input.obligationInstanceId} not found`);
      const obligationOwnerId = obligation.userId ?? obligation.tradelineUserId;
      if (!isAdmin && obligationOwnerId !== user.id) {
        return new Response(JSON.stringify({ error: "Access denied: this obligation instance does not belong to you." }), { status: 403 });
      }
      obligationTradelineId = obligation.tradelineId;
      if (obligation.tradelineId !== null) linkedTradelineIds.push(obligation.tradelineId);
    }

    const uniqueLinkedTradelineIds = new Set(linkedTradelineIds);
    if (uniqueLinkedTradelineIds.size > 1) {
      return new Response(
        JSON.stringify({ error: "Linked packet, tradeline, and obligation instance must refer to the same tradeline." }),
        { status: 400 }
      );
    }
    const effectiveTradelineId = input.tradelineId ?? packetTradelineId ?? obligationTradelineId;

    // Compute SHA-256 hash of the file content
    const fileHash = CryptoJS.SHA256(input.fileDataBase64).toString(CryptoJS.enc.Hex);
    
    const fileSizeBytes = getBase64DecodedByteLength(input.fileDataBase64);

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
          ?? effectiveTradelineId
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
      let responseClassification = classifyBureauResponse({
        communicationType: input.communicationType,
        responseStatus: input.responseStatus,
        responseLetterContent: input.responseLetterContent,
        description: input.description,
        responseMovDisclosed: input.responseMovDisclosed,
        responseMovDescription: input.responseMovDescription,
        responseDocumentationProvided: input.responseDocumentationProvided,
        responseDocumentationTypes: input.responseDocumentationTypes,
        responseItemsDisputed: input.responseItemsDisputed,
        responseItemsAddressed: input.responseItemsAddressed,
        responseReceivedDate: timestamp,
      });
      
      if (input.obligationInstanceId) {
        // Direct obligation instance provided
        const currentObligation = await trx
          .selectFrom("obligationInstance")
          .selectAll()
          .where("id", "=", input.obligationInstanceId)
          .executeTakeFirst();
        const obligationUpdate = buildObligationUpdate(input, timestamp, currentObligation ?? null);
        const updateData = obligationUpdate.updateData;
        responseClassification = obligationUpdate.classification;
        const newState = updateData.state;
        
        updatedObligationInstance = await trx
          .updateTable("obligationInstance")
          .set(updateData)
          .where("id", "=", input.obligationInstanceId)
          .returningAll()
          .executeTakeFirst();

        console.log(`Updated obligation instance ${input.obligationInstanceId} to state ${newState} due to ${input.communicationType}`);
        
      } else if (effectiveTradelineId) {
        // No direct obligation instance, find most recent challenged one for the tradeline
        const pendingObligation = await trx
          .selectFrom("obligationInstance")
          .selectAll()
          .where("tradelineId", "=", effectiveTradelineId)
          .where("state", "=", "CHALLENGED")
          .orderBy("createdAt", "desc")
          .limit(1)
          .executeTakeFirst();

        if (pendingObligation) {
          const obligationUpdate = buildObligationUpdate(input, timestamp, pendingObligation);
          const updateData = obligationUpdate.updateData;
          responseClassification = obligationUpdate.classification;
          const newState = updateData.state;
          
          updatedObligationInstance = await trx
            .updateTable("obligationInstance")
            .set(updateData)
            .where("id", "=", pendingObligation.id)
            .returningAll()
            .executeTakeFirst();

          console.log(`Auto-linked and updated obligation instance ${pendingObligation.id} for tradeline ${effectiveTradelineId} to state ${newState} due to ${input.communicationType}`);
        } else {
          console.log(`No pending obligation instance found for tradeline ${effectiveTradelineId}`);
        }
      }

      const packetUpdate = input.packetId ? buildPacketUpdate(responseClassification, timestamp) : null;
      if (input.packetId && packetUpdate) {
        await trx
          .updateTable("packet")
          .set(packetUpdate)
          .where("id", "=", input.packetId)
          .execute();
      }

      return { evidenceEvent, evidenceAttachment, updatedObligationInstance, responseClassification };
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
        responseClassification: result.responseClassification,
        fileName: input.fileName,
        linkedTo: {
          tradelineId: effectiveTradelineId,
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
      fileHash,
      responseClassification: result.responseClassification,
    } satisfies OutputType));

  } catch (error) {
        return handleEndpointError(error);
  }
}
