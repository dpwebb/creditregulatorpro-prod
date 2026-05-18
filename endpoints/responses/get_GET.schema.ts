import { z } from "zod";

import type { ResponseDocumentRecord } from "../../helpers/responseDocumentService";

export const schema = z.object({
  responseId: z.coerce.number().int().positive(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  response: ResponseDocumentRecord;
};

export const getResponseDocument = async (params: InputType, init?: RequestInit): Promise<OutputType> => {
  const searchParams = new URLSearchParams();
  searchParams.set("responseId", String(params.responseId));

  const result = await fetch(`/_api/responses/get?${searchParams.toString()}`, {
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
