import { z } from "zod";

import { Selectable } from "kysely";
import { IdentityTheftFreeze, FreezeStatus } from "../../helpers/schema";

export const FRAUD_FREEZE_LIST_DEFAULT_LIMIT = 50;
export const FRAUD_FREEZE_LIST_MAX_LIMIT = 100;

export const schema = z.object({
  userId: z.number().optional(),
  status: z.enum(["active", "cancelled", "expired", "requested", "thawed"]).optional(),
  limit: z.coerce.number().int().min(1).max(FRAUD_FREEZE_LIST_MAX_LIMIT).default(FRAUD_FREEZE_LIST_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

export type InputType = Partial<z.infer<typeof schema>>;

export type FreezeWithDetails = Selectable<IdentityTheftFreeze> & {
  bureauName: string;
  userEmail: string;
  userFullName: string | null;
};

export type OutputType = {
  freezes: FreezeWithDetails[];
};

export const getFreezeList = async (params: InputType = {}, init?: RequestInit): Promise<OutputType> => {
  const searchParams = new URLSearchParams();
  if (params.userId) searchParams.set("userId", params.userId.toString());
  if (params.status) searchParams.set("status", params.status);
  if (params.limit !== undefined) searchParams.set("limit", params.limit.toString());
  if (params.offset !== undefined) searchParams.set("offset", params.offset.toString());

  const result = await fetch(`/_api/fraud-freeze/list?${searchParams.toString()}`, {
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
