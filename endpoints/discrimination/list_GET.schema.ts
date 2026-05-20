import { z } from "zod";

import { Selectable } from "kysely";
import { DiscriminationClaim } from "../../helpers/schema";

export const DISCRIMINATION_CLAIM_LIST_DEFAULT_LIMIT = 50;
export const DISCRIMINATION_CLAIM_LIST_MAX_LIMIT = 100;

export const schema = z.object({
  tradelineId: z.number().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(DISCRIMINATION_CLAIM_LIST_MAX_LIMIT).default(DISCRIMINATION_CLAIM_LIST_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

export type InputType = Partial<z.infer<typeof schema>>;

export type DiscriminationClaimWithDetails = Selectable<DiscriminationClaim> & {
  tradelineAccountNumber: string;
  creditorName: string | null;
};

export type OutputType = DiscriminationClaimWithDetails[];

export const getDiscriminationClaims = async (params: InputType = {}, init?: RequestInit): Promise<OutputType> => {
  const searchParams = new URLSearchParams();
  if (params.tradelineId) searchParams.set("tradelineId", params.tradelineId.toString());
  if (params.status) searchParams.set("status", params.status);
  if (params.limit !== undefined) searchParams.set("limit", params.limit.toString());
  if (params.offset !== undefined) searchParams.set("offset", params.offset.toString());

  const result = await fetch(`/_api/discrimination/list?${searchParams.toString()}`, {
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
