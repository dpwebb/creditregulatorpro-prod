import { z } from "zod";

import { Selectable } from "kysely";
import { LicensedCollectionAgency } from "../../helpers/schema";

export const schema = z.object({
  agencyName: z.string().min(1),
  province: z.string().length(2),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  found: boolean;
  agency: Selectable<LicensedCollectionAgency> | null;
  registryUrl: string | null;
};

export const getLicensedAgencyCheck = async (
  params: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const url = new URL(`/_api/licensed-agency/check`, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  url.searchParams.append("agencyName", params.agencyName);
  url.searchParams.append("province", params.province);

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