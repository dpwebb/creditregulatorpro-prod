import { z } from "zod";

import { Selectable } from "kysely";
import { ConsumerSignature, FreezeStatus, FreezeType } from "../../helpers/schema";

export const schema = z.object({
  id: z.coerce.number().int().positive(),
});

export type InputType = z.infer<typeof schema>;

export type ConsumerSignatureDetail = Selectable<ConsumerSignature> & {
  freezeType: FreezeType | null;
  freezeStatus: FreezeStatus | null;
  freezeBureauId: number | null;
};

export type OutputType = {
  signature: ConsumerSignatureDetail;
};

export const getSignature = async (
  params: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const searchParams = new URLSearchParams({ id: params.id.toString() });
  const result = await fetch(`/_api/consumer-signature/get?${searchParams.toString()}`, {
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
