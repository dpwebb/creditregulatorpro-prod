import { z } from "zod";

import { Json, SignatureType, SignatureTypeArrayValues, FreezeType, FreezeStatus } from "../../helpers/schema";

export const CONSUMER_SIGNATURE_LIST_DEFAULT_LIMIT = 50;
export const CONSUMER_SIGNATURE_LIST_MAX_LIMIT = 100;

export const schema = z.object({
  signatureType: z.enum(SignatureTypeArrayValues).optional(),
  limit: z.coerce.number().int().min(1).max(CONSUMER_SIGNATURE_LIST_MAX_LIMIT).default(CONSUMER_SIGNATURE_LIST_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

export type InputType = Partial<z.infer<typeof schema>>;

export type ConsumerSignatureListItem = {
  id: number;
  userId: number;
  signatureType: SignatureType;
  isVerified: boolean;
  verifiedAt: Date | null;
  verifiedBy: number | null;
  associatedFreezeId: number | null;
  metadata: Json | null;
  createdAt: Date;
  freezeType: FreezeType | null;
  freezeStatus: FreezeStatus | null;
  freezeBureauId: number | null;
};

export type OutputType = {
  signatures: ConsumerSignatureListItem[];
};

export const getSignatureList = async (params: InputType = {}, init?: RequestInit): Promise<OutputType> => {
  const searchParams = new URLSearchParams();
  if (params.signatureType) searchParams.set("signatureType", params.signatureType);
  if (params.limit !== undefined) searchParams.set("limit", params.limit.toString());
  if (params.offset !== undefined) searchParams.set("offset", params.offset.toString());

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
