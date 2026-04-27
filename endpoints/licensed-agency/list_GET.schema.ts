import { z } from "zod";

import { Selectable } from "kysely";
import { LicensedCollectionAgency } from "../../helpers/schema";

export const schema = z.object({
  province: z.string().optional(),
  search: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  agencies: Selectable<LicensedCollectionAgency>[];
  total: number;
};

export const getLicensedAgencyList = async (
  params: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const url = new URL(`/_api/licensed-agency/list`, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  if (params.province) url.searchParams.append("province", params.province);
  if (params.search) url.searchParams.append("search", params.search);
  if (params.status) url.searchParams.append("status", params.status);
  url.searchParams.append("limit", params.limit!.toString());
  url.searchParams.append("offset", params.offset!.toString());

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