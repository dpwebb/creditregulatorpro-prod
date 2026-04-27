import { z } from "zod";

import { EnforcementMechanismTypeArrayValues, EnforcementMechanismType } from "../../helpers/schema";

export const schema = z.object({
  jurisdiction: z.string().optional(),
  mechanismType: z.enum(EnforcementMechanismTypeArrayValues).optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  mechanisms: {
    id: number;
    createdAt: Date | null;
    jurisdiction: string;
    mechanismType: EnforcementMechanismType;
    name: string;
    description: string;
    statutoryReference: string | null;
    penaltyAmount: string | null;
    contactInfo: string | null;
    websiteUrl: string | null;
    filingDeadlineDays: number | null;
    notes: string | null;
    region: string;
  }[];
};

export const getEnforcementMechanismList = async (filters?: InputType, init?: RequestInit): Promise<OutputType> => {
  const params = new URLSearchParams();
  if (filters?.jurisdiction) params.append("jurisdiction", filters.jurisdiction);
  if (filters?.mechanismType) params.append("mechanismType", filters.mechanismType);

  const queryString = params.toString();
  const url = `/_api/enforcement-mechanism/list${queryString ? `?${queryString}` : ""}`;

  const result = await fetch(url, {
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