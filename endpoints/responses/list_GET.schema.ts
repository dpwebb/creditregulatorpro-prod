import { z } from "zod";

import type { ResponseDocumentRecord } from "../../helpers/responseDocumentService";
import {
  BureauResponseChannelArrayValues,
  BureauResponseDocumentTypeArrayValues,
  BureauResponseStatusArrayValues,
} from "../../helpers/schema";

export const schema = z.object({
  packetId: z.coerce.number().int().positive().optional(),
  disputePacketFindingId: z.coerce.number().int().positive().optional(),
  findingOutcomeId: z.coerce.number().int().positive().optional(),
  comparisonRunId: z.coerce.number().int().positive().optional(),
  bureauId: z.coerce.number().int().positive().optional(),
  agencyId: z.coerce.number().int().positive().optional(),
  responseChannel: z.enum(BureauResponseChannelArrayValues).optional(),
  responseDocumentType: z.enum(BureauResponseDocumentTypeArrayValues).optional(),
  responseStatus: z.enum(BureauResponseStatusArrayValues).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  responses: ResponseDocumentRecord[];
  total: number;
};

export const getResponseList = async (params?: InputType, init?: RequestInit): Promise<OutputType> => {
  const searchParams = new URLSearchParams();
  if (params?.packetId !== undefined) searchParams.set("packetId", String(params.packetId));
  if (params?.disputePacketFindingId !== undefined) searchParams.set("disputePacketFindingId", String(params.disputePacketFindingId));
  if (params?.findingOutcomeId !== undefined) searchParams.set("findingOutcomeId", String(params.findingOutcomeId));
  if (params?.comparisonRunId !== undefined) searchParams.set("comparisonRunId", String(params.comparisonRunId));
  if (params?.bureauId !== undefined) searchParams.set("bureauId", String(params.bureauId));
  if (params?.agencyId !== undefined) searchParams.set("agencyId", String(params.agencyId));
  if (params?.responseChannel !== undefined) searchParams.set("responseChannel", params.responseChannel);
  if (params?.responseDocumentType !== undefined) searchParams.set("responseDocumentType", params.responseDocumentType);
  if (params?.responseStatus !== undefined) searchParams.set("responseStatus", params.responseStatus);
  if (params?.startDate !== undefined) searchParams.set("startDate", params.startDate.toISOString());
  if (params?.endDate !== undefined) searchParams.set("endDate", params.endDate.toISOString());
  if (params?.limit !== undefined) searchParams.set("limit", String(params.limit));
  if (params?.offset !== undefined) searchParams.set("offset", String(params.offset));
  const queryString = searchParams.toString() ? `?${searchParams.toString()}` : "";

  const result = await fetch(`/_api/responses/list${queryString}`, {
    method: "GET",
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
