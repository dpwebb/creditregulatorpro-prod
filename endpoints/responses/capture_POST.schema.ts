import { z } from "zod";

import type { ResponseDocumentRecord } from "../../helpers/responseDocumentService";
import type { ResponseIntakeResult, ResponseIntakeSourceType } from "../../helpers/responseIntakeService";
import type { Json } from "../../helpers/schema";
import {
  BureauResponseChannelArrayValues,
  BureauResponseDocumentTypeArrayValues,
  BureauResponseStatusArrayValues,
} from "../../helpers/schema";

const safeMetadataSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string().max(500),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(safeMetadataSchema).max(30),
    z.record(z.string().regex(/^[a-zA-Z0-9_.:-]{1,64}$/), safeMetadataSchema),
  ]),
);

const safeMetadataObjectSchema = z.record(z.string().regex(/^[a-zA-Z0-9_.:-]{1,64}$/), safeMetadataSchema);

const responseIntakeSourceTypeSchema = z.enum(["manual_admin", "simulated_inbox", "future_mailbox"]);

export const schema = z.object({
  intakeSourceType: responseIntakeSourceTypeSchema.optional(),
  userId: z.coerce.number().int().positive().optional(),
  packetId: z.coerce.number().int().positive().nullable().optional(),
  disputePacketFindingId: z.coerce.number().int().positive().nullable().optional(),
  findingOutcomeId: z.coerce.number().int().positive().nullable().optional(),
  comparisonRunId: z.coerce.number().int().positive().nullable().optional(),
  bureauId: z.coerce.number().int().positive().nullable().optional(),
  agencyId: z.coerce.number().int().positive().nullable().optional(),
  responseChannel: z.enum(BureauResponseChannelArrayValues),
  responseDocumentType: z.enum(BureauResponseDocumentTypeArrayValues),
  responseReceivedAt: z.coerce.date(),
  responseSource: z.string().trim().max(80).nullable().optional(),
  responseSubject: z.string().trim().max(240).nullable().optional(),
  responseSenderDomain: z.string().trim().max(255).nullable().optional(),
  responseReferenceId: z.string().trim().max(160).nullable().optional(),
  attachmentEvidenceId: z.coerce.number().int().positive().nullable().optional(),
  evidenceAttachmentId: z.coerce.number().int().positive().nullable().optional(),
  normalizedResponseHash: z.string().trim().max(128).nullable().optional(),
  responseText: z.string().trim().max(4000).nullable().optional(),
  responseSummary: z.string().trim().max(1000).nullable().optional(),
  responseStatus: z.enum(BureauResponseStatusArrayValues).optional(),
  rawArtifactMetadata: safeMetadataObjectSchema.nullable().optional(),
  normalizedResponseMetadata: safeMetadataObjectSchema.nullable().optional(),
  sourceMessageId: z.string().trim().max(160).nullable().optional(),
  sourceReceivedAt: z.coerce.date().nullable().optional(),
  sourceMetadata: safeMetadataObjectSchema.nullable().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  response: ResponseDocumentRecord;
  intake?: Pick<
    ResponseIntakeResult,
    "status" | "sourceType" | "duplicateOfResponseId" | "idempotencyKey" | "responseTextHash" | "responseTextStored"
  >;
};

export type ResponseCaptureIntakeSourceType = ResponseIntakeSourceType;

export const postResponseCapture = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch("/_api/responses/capture", {
    method: "POST",
    body: JSON.stringify(validatedInput),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!result.ok) {
    const errorObject = JSON.parse(await result.text());
    throw new Error(errorObject.error);
  }
  return JSON.parse(await result.text());
};
