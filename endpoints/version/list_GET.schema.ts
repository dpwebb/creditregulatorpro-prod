import { z } from "zod";

import { Selectable } from "kysely";
import { SoftwareVersion } from "../../helpers/schema";

export const VERSION_LIST_DEFAULT_LIMIT = 50;
export const VERSION_LIST_MAX_LIMIT = 100;

export const schema = z.object({
  limit: z.coerce.number().int().min(1).max(VERSION_LIST_MAX_LIMIT).default(VERSION_LIST_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

export type InputType = Partial<z.infer<typeof schema>>;
export type OutputType = Selectable<SoftwareVersion>[];

export const getVersionList = async (params?: Partial<InputType>, init?: RequestInit): Promise<OutputType> => {
  const searchParams = new URLSearchParams();
  if (params?.limit !== undefined) searchParams.set("limit", params.limit.toString());
  if (params?.offset !== undefined) searchParams.set("offset", params.offset.toString());
  const queryString = searchParams.toString() ? `?${searchParams.toString()}` : "";

  const result = await fetch(`/_api/version/list${queryString}`, {
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
