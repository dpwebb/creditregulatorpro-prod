import { z } from "zod";

import { Selectable } from "kysely";
import { EvidenceEvent, Packet, Tradeline } from "../../helpers/schema";

export const EVIDENCE_LIST_DEFAULT_LIMIT = 50;
export const EVIDENCE_LIST_MAX_LIMIT = 100;

// Optional tradelineId query parameter for filtering
export const schema = z.object({
  tradelineId: z.coerce.number().optional(),
  limit: z.coerce.number().int().min(1).max(EVIDENCE_LIST_MAX_LIMIT).default(EVIDENCE_LIST_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

export type InputType = Partial<z.infer<typeof schema>>;

// We are selecting all evidence_event fields plus some joined fields
// We need to define the shape of the joined result
export type EvidenceEventWithDetails = Selectable<EvidenceEvent> & {
  packetStatus: Selectable<Packet>['status'] | null;
  tradelineId: Selectable<Packet>['tradelineId'] | null;
  tradelineAccountNumber: Selectable<Tradeline>['accountNumber'] | null;
};

export type OutputType = {
  events: EvidenceEventWithDetails[];
  total: number;
};

export const getEvidenceList = async (params: InputType = {}, init?: RequestInit): Promise<OutputType> => {
  // Build URL with optional query parameters
  const url = new URL(`/_api/evidence/list`, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  if (params.tradelineId !== undefined) {
    url.searchParams.append('tradelineId', params.tradelineId.toString());
  }
  if (params.limit !== undefined) {
    url.searchParams.append('limit', params.limit.toString());
  }
  if (params.offset !== undefined) {
    url.searchParams.append('offset', params.offset.toString());
  }

  const result = await fetch(url.toString(), {
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
