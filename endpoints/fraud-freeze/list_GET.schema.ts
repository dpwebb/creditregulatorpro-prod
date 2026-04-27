import { z } from "zod";

import { Selectable } from "kysely";
import { IdentityTheftFreeze, FreezeStatus } from "../../helpers/schema";

export const schema = z.object({
  userId: z.number().optional(),
  status: z.enum(["active", "cancelled", "expired", "requested", "thawed"]).optional(),
});

export type InputType = z.infer<typeof schema>;

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