import { z } from "zod";

import { Selectable } from "kysely";
import { ConsumerSignature, SignatureTypeArrayValues, FreezeType, FreezeStatus } from "../../helpers/schema";

export const schema = z.object({
  signatureType: z.enum(SignatureTypeArrayValues).optional(),
  limit: z.number().default(50),
});

export type InputType = z.infer<typeof schema>;

export type ConsumerSignatureWithDetails = Selectable<ConsumerSignature> & {
  freezeType: FreezeType | null;
  freezeStatus: FreezeStatus | null;
  freezeBureauId: number | null;
};

export type OutputType = {
  signatures: ConsumerSignatureWithDetails[];
};

export const getSignatureList = async (params: InputType = { limit: 50 }, init?: RequestInit): Promise<OutputType> => {
  const searchParams = new URLSearchParams();
  if (params.signatureType) searchParams.set("signatureType", params.signatureType);
  if (params.limit) searchParams.set("limit", params.limit.toString());

  const result = await fetch(`/_api/consumer-signature/list?${searchParams.toString()}`, {
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