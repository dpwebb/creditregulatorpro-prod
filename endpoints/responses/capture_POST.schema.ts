import { z } from "zod";

import type { ResponseDocumentRecord } from "../../helpers/responseDocumentService";
import {
  BureauResponseChannelArrayValues,
  BureauResponseDocumentTypeArrayValues,
  BureauResponseStatusArrayValues,
} from "../../helpers/schema";

export const schema = z.object({
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
  responseSummary: z.string().trim().max(1000).nullable().optional(),
  responseStatus: z.enum(BureauResponseStatusArrayValues).optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  response: ResponseDocumentRecord;
};

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
