import { sql } from "kysely";

import { logAudit } from "./auditLogger";
import { db } from "./db";
import { BusinessRuleError } from "./endpointErrorHandler";
import {
  captureResponseDocument,
  computeResponseDocumentStableHash,
  ensureResponseDocumentSchema,
  getResponseDocument,
  sanitizeResponseIntakeText,
  sanitizeResponseMetadata,
  validateResponseDocumentRelationships,
  type CaptureResponseDocumentInput,
  type ResponseDocumentRecord,
  type ResponseDocumentUser,
} from "./responseDocumentService";
import type { BureauResponseChannel, BureauResponseDocumentType, Json } from "./schema";

export const RESPONSE_INTAKE_SOURCE_TYPES = [
  "manual_admin",
  "simulated_inbox",
  "future_mailbox",
] as const;

export type ResponseIntakeSourceType = typeof RESPONSE_INTAKE_SOURCE_TYPES[number];
export type ResponseIntakeStatus = "captured" | "duplicate";

export type ResponseIntakeInput = CaptureResponseDocumentInput & {
  intakeSourceType: ResponseIntakeSourceType;
  responseText?: string | null;
  sourceMessageId?: string | null;
  sourceReceivedAt?: Date | string | null;
  sourceMetadata?: Record<string, Json> | null;
};

export type ResponseIntakeResult = {
  status: ResponseIntakeStatus;
  sourceType: ResponseIntakeSourceType;
  response: ResponseDocumentRecord;
  duplicateOfResponseId: number | null;
  idempotencyKey: string;
  responseTextHash: string | null;
  responseTextStored: false;
};

type IntakePreparedPayload = {
  captureInput: CaptureResponseDocumentInput;
  idempotencyKey: string;
  responseTextHash: string | null;
};

function isAdminOnlySource(sourceType: ResponseIntakeSourceType): boolean {
  return sourceType === "manual_admin" || sourceType === "simulated_inbox" || sourceType === "future_mailbox";
}

function assertAllowedIntakeSource(sourceType: ResponseIntakeSourceType, user: ResponseDocumentUser): void {
  if (!RESPONSE_INTAKE_SOURCE_TYPES.includes(sourceType)) {
    throw new BusinessRuleError("Unsupported response intake source type.", 400);
  }
  if (isAdminOnlySource(sourceType) && user.role !== "admin") {
    throw new BusinessRuleError("Admin privileges required for this response intake source.", 403);
  }
}

function toDateKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BusinessRuleError("responseReceivedAt must be a valid date.", 400);
  }
  return date.toISOString().slice(0, 10);
}

function stableJsonStringify(value: Json): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJsonStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function metadataHash(value: Record<string, Json>): string {
  return computeResponseDocumentStableHash([stableJsonStringify(value)]);
}

function hasUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; cause?: { code?: string; message?: string } };
  return (
    candidate?.code === "23505" ||
    candidate?.cause?.code === "23505" ||
    /idx_bureau_response_event_intake_idempotency_unique|duplicate key value/i.test(candidate?.message ?? "") ||
    /idx_bureau_response_event_intake_idempotency_unique|duplicate key value/i.test(candidate?.cause?.message ?? "")
  );
}

async function findDuplicateByIdempotencyKey(
  idempotencyKey: string,
  user: ResponseDocumentUser,
): Promise<ResponseDocumentRecord | null> {
  const result = await sql<{ id: number }>`
    select id
    from public.bureau_response_event
    where normalized_response_metadata #>> '{intake,idempotencyKey}' = ${idempotencyKey}
    order by created_at asc, id asc
    limit 1
  `.execute(db);
  const responseId = Number(result.rows[0]?.id ?? 0);
  if (!Number.isInteger(responseId) || responseId <= 0) return null;
  return getResponseDocument({ responseId }, user);
}

function prepareIntakeCaptureInput(input: ResponseIntakeInput, user: ResponseDocumentUser): Promise<IntakePreparedPayload> {
  return (async () => {
    const responseText = input.responseText ? sanitizeResponseIntakeText(input.responseText) : null;
    if (!responseText && !String(input.responseSummary ?? "").trim()) {
      throw new BusinessRuleError("Response intake requires response text or a response summary.", 400);
    }

    const responseTextHash = responseText?.textHash ?? input.normalizedResponseHash ?? null;
    const rawArtifactMetadata = {
      ...(input.rawArtifactMetadata ?? {}),
      intakeArtifact: {
        sourceType: input.intakeSourceType,
        sourceMessageId: input.sourceMessageId ?? null,
        sourceReceivedAt: input.sourceReceivedAt ? new Date(input.sourceReceivedAt).toISOString() : null,
        responseTextStored: false,
      },
    };
    const normalizedResponseMetadata = {
      ...(input.normalizedResponseMetadata ?? {}),
      intake: {
        sourceType: input.intakeSourceType,
        responseTextHash,
        responseTextLength: responseText?.textLength ?? null,
        responseSummaryTruncated: responseText?.summaryTruncated ?? false,
        responseTextStored: false,
        duplicatePolicy: "user_packet_source_date_text_hash_metadata",
      },
      sourceMetadata: input.sourceMetadata ?? {},
    };

    const baseCaptureInput: CaptureResponseDocumentInput = {
      ...input,
      responseSummary: responseText?.summary ?? input.responseSummary ?? null,
      normalizedResponseHash: responseTextHash,
      responseSource: input.responseSource ?? input.intakeSourceType,
      rawArtifactMetadata,
      normalizedResponseMetadata,
    };

    const links = await validateResponseDocumentRelationships(baseCaptureInput, user);
    const safe = sanitizeResponseMetadata(baseCaptureInput);
    const idempotencyKey = computeResponseDocumentStableHash([
      input.intakeSourceType,
      String(links.userId),
      links.packetId === null ? "packet-null" : String(links.packetId),
      safe.responseSource,
      toDateKey(safe.responseReceivedAt),
      safe.normalizedResponseHash,
      baseCaptureInput.responseChannel,
      baseCaptureInput.responseDocumentType,
      safe.responseSenderDomain,
      safe.responseReferenceId,
      metadataHash(safe.rawArtifactMetadata),
      metadataHash(safe.normalizedResponseMetadata),
    ]);

    return {
      idempotencyKey,
      responseTextHash,
      captureInput: {
        ...baseCaptureInput,
        normalizedResponseMetadata: {
          ...normalizedResponseMetadata,
          intake: {
            ...normalizedResponseMetadata.intake,
            idempotencyKey,
          },
        },
      },
    };
  })();
}

async function logIntakeAudit(params: {
  status: ResponseIntakeStatus;
  sourceType: ResponseIntakeSourceType;
  response: ResponseDocumentRecord;
  actorUserId: number;
  idempotencyKey: string;
  responseTextHash: string | null;
  duplicateOfResponseId: number | null;
  request?: Request;
}): Promise<void> {
  await logAudit({
    action: "RESPONSE_RECORDED",
    entityType: "SYSTEM",
    entityId: params.response.id,
    userId: params.actorUserId,
    details: {
      component: "response_intake",
      action: params.status === "duplicate" ? "response_intake_duplicate" : "response_intake_captured",
      sourceType: params.sourceType,
      responseId: params.response.id,
      duplicateOfResponseId: params.duplicateOfResponseId,
      idempotencyKey: params.idempotencyKey,
      responseTextHash: params.responseTextHash,
      responseTextStored: false,
      rawResponseTextLogged: false,
      sourceMetadataPreserved: true,
      responseDocumentsRemainEvidenceMetadataOnly: true,
      canonicalFactsMutated: false,
      violationTruthMutated: false,
      packetReadyStateChanged: false,
      liveMailboxIntegrationUsed: false,
    },
    status: "SUCCESS",
    request: params.request,
  });
}

export async function intakeResponseDocument(
  input: ResponseIntakeInput,
  user: ResponseDocumentUser,
  request?: Request,
): Promise<ResponseIntakeResult> {
  await ensureResponseDocumentSchema();
  assertAllowedIntakeSource(input.intakeSourceType, user);

  const prepared = await prepareIntakeCaptureInput(input, user);
  const existing = await findDuplicateByIdempotencyKey(prepared.idempotencyKey, user);
  if (existing) {
    await logIntakeAudit({
      status: "duplicate",
      sourceType: input.intakeSourceType,
      response: existing,
      actorUserId: user.id,
      idempotencyKey: prepared.idempotencyKey,
      responseTextHash: prepared.responseTextHash,
      duplicateOfResponseId: existing.id,
      request,
    });
    return {
      status: "duplicate",
      sourceType: input.intakeSourceType,
      response: existing,
      duplicateOfResponseId: existing.id,
      idempotencyKey: prepared.idempotencyKey,
      responseTextHash: prepared.responseTextHash,
      responseTextStored: false,
    };
  }

  try {
    const response = await captureResponseDocument(prepared.captureInput, user, request);
    await logIntakeAudit({
      status: "captured",
      sourceType: input.intakeSourceType,
      response,
      actorUserId: user.id,
      idempotencyKey: prepared.idempotencyKey,
      responseTextHash: prepared.responseTextHash,
      duplicateOfResponseId: null,
      request,
    });
    return {
      status: "captured",
      sourceType: input.intakeSourceType,
      response,
      duplicateOfResponseId: null,
      idempotencyKey: prepared.idempotencyKey,
      responseTextHash: prepared.responseTextHash,
      responseTextStored: false,
    };
  } catch (error) {
    if (!hasUniqueViolation(error)) throw error;
    const duplicate = await findDuplicateByIdempotencyKey(prepared.idempotencyKey, user);
    if (!duplicate) throw error;
    await logIntakeAudit({
      status: "duplicate",
      sourceType: input.intakeSourceType,
      response: duplicate,
      actorUserId: user.id,
      idempotencyKey: prepared.idempotencyKey,
      responseTextHash: prepared.responseTextHash,
      duplicateOfResponseId: duplicate.id,
      request,
    });
    return {
      status: "duplicate",
      sourceType: input.intakeSourceType,
      response: duplicate,
      duplicateOfResponseId: duplicate.id,
      idempotencyKey: prepared.idempotencyKey,
      responseTextHash: prepared.responseTextHash,
      responseTextStored: false,
    };
  }
}

export function responseDocumentTypeForSender(senderType: "bureau" | "creditor" | "collector"): BureauResponseDocumentType {
  if (senderType === "collector") return "collection_agency_letter_response";
  if (senderType === "creditor") return "manual_response_note";
  return "bureau_email_response";
}

export function responseChannelForIntakeSource(sourceType: ResponseIntakeSourceType): BureauResponseChannel {
  if (sourceType === "simulated_inbox" || sourceType === "future_mailbox") return "email";
  if (sourceType === "manual_admin") return "manual_record";
  return "unknown";
}
