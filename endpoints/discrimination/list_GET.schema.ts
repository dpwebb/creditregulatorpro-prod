import { z } from "zod";

import { Selectable } from "kysely";
import { DiscriminationClaim } from "../../helpers/schema";

export const schema = z.object({
  tradelineId: z.number().optional(),
  status: z.string().optional(),
});

export type InputType = z.infer<typeof schema>;

export type DiscriminationClaimWithDetails = Selectable<DiscriminationClaim> & {
  tradelineAccountNumber: string;
  creditorName: string | null;
};

export type OutputType = DiscriminationClaimWithDetails[];

export const getDiscriminationClaims = async (params: InputType = {}, init?: RequestInit): Promise<OutputType> => {
  const searchParams = new URLSearchParams();
  if (params.tradelineId) searchParams.set("tradelineId", params.tradelineId.toString());
  if (params.status) searchParams.set("status", params.status);

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