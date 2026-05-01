import { schema } from "./bureau-communication_POST.schema";
import type { InputType, OutputType } from "./bureau-communication_POST.schema";
import type { Json, ObligationState } from "../../helpers/schema";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { checkRateLimit } from "../../helpers/rateLimiter";
import { logAudit } from "../../helpers/auditLogger";
import { chain } from "../../helpers/hashChain";
import { runAllResponseAuditDetectors } from "../../helpers/complianceDetectorResponse";
import CryptoJS from "crypto-js";

const stateMapping: Record<InputType["communicationType"], ObligationState> = {
  "BUREAU_DENIAL": "INSUFFICIENT_RESPONSE",
  "BUREAU_VERIFICATION_REQUEST": "CHALLENGED",
  "BUREAU_CORRECTION_NOTICE": "INSUFFICIENT_RESPONSE",
  "BUREAU_RESPONSE_RECEIVED": "INSUFFICIENT_RESPONSE",
  "BUREAU_ACKNOWLEDGMENT": "CHALLENGED",
  "BUREAU_OTHER": "INSUFFICIENT_RESPONSE",
};

const responseStatusMapping: Record<InputType["communicationType"], string> = {
  "BUREAU_DENIAL": "denied",
  "BUREAU_VERIFICATION_REQUEST": "verification requested",
  "BUREAU_CORRECTION_NOTICE": "correction notice received",
  "BUREAU_RESPONSE_RECEIVED": "response received",
  "BUREAU_ACKNOWLEDGMENT": "acknowledged",
  "BUREAU_OTHER": "other bureau response",
};

const substantiveResponseTypes = new Set<InputType["communicationType"]>([
  "BUREAU_DENIAL",
  "BUREAU_CORRECTION_NOTICE",
  "BUREAU_RESPONSE_RECEIVED",
  "BUREAU_OTHER",
]);

function isSubstantiveResponse(type: InputType["communicationType"]) {
  return substantiveResponseTypes.has(type);
}

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
): Record<string, any> {
  const newState = stateMapping[input.communicationType];
  const updateData: Record<string, any> = { state: newState };
  const substantive = isSubstantiveResponse(input.communicationType);

  if (substantive) {
    updateData.responseReceivedDate = timestamp;
    updateData.responseStatus = input.responseStatus ?? responseStatusMapping[input.communicationType];
    if (input.responseLetterContent !== undefined || input.description) {
      updateData.responseLetterContent = input.responseLetterContent ?? input.description ?? null;
    }
  } else if (input.responseStatus !== undefined) {
    updateData.responseStatus = input.responseStatus;
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
    (input.runAudit !== false && substantive && (hasResponseMetadata(input) || input.description));

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

    const json = JSON.parse(await request.text());
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
      
      if (input.obligationInstanceId) {
        // Direct obligation instance provided
        const currentObligation = await trx
          .selectFrom("obligationInstance")
          .selectAll()
          .where("id", "=", input.obligationInstanceId)
          .executeTakeFirst();
        const updateData = buildObligationUpdate(input, timestamp, currentObligation ?? null);
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
          const updateData = buildObligationUpdate(input, timestamp, pendingObligation);
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
      fileHash
    } satisfies OutputType));

  } catch (error) {
        return handleEndpointError(error);
  }
}
