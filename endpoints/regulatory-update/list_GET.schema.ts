import { z } from "zod";

import { 
  RegulatoryUpdateStatusArrayValues, 
  RegulatoryChangeTypeArrayValues, 
  RegulatoryUpdateSourceArrayValues,
  RegulatoryUpdateStatus,
  RegulatoryChangeType,
  RegulatoryUpdateSource
} from "../../helpers/schema";

export const schema = z.object({
  jurisdiction: z.string().optional(),
  status: z.enum(RegulatoryUpdateStatusArrayValues).optional(),
  changeType: z.enum(RegulatoryChangeTypeArrayValues).optional(),
  source: z.enum(RegulatoryUpdateSourceArrayValues).optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  updates: {
    id: number;
    createdAt: Date | null;
    detectedAt: Date | null;
    jurisdiction: string;
    title: string;
    description: string;
    changeType: RegulatoryChangeType;
    source: RegulatoryUpdateSource;
    status: RegulatoryUpdateStatus;
    region: string;
    statutoryReference: string | null;
    effectiveDate: Date | null;
    sourceUrl: string | null;
    impactAssessment: string | null;
    actionRequired: string | null;
    notes: string | null;
    reviewedAt: Date | null;
    reviewedBy: string | null;
    appliedAt: Date | null;
  }[];
};

export const getRegulatoryUpdateList = async (filters?: InputType, init?: RequestInit): Promise<OutputType> => {
  const params = new URLSearchParams();
  if (filters?.jurisdiction) params.append("jurisdiction", filters.jurisdiction);
  if (filters?.status) params.append("status", filters.status);
  if (filters?.changeType) params.append("changeType", filters.changeType);
  if (filters?.source) params.append("source", filters.source);

  const queryString = params.toString();
  const url = `/_api/regulatory-update/list${queryString ? `?${queryString}` : ""}`;

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