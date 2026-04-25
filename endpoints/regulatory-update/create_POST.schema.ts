import { z } from "zod";

import { 
  RegulatoryUpdateStatusArrayValues, 
  RegulatoryChangeTypeArrayValues, 
  RegulatoryUpdateSourceArrayValues,
  RegulatoryUpdateStatus,
  RegulatoryChangeType,
  RegulatoryUpdateSource
} from "../../helpers/schema";
import { CANADIAN_JURISDICTIONS } from "../../helpers/canadianJurisdictions";

export const schema = z.object({
  jurisdiction: z.enum(CANADIAN_JURISDICTIONS),
  changeType: z.enum(RegulatoryChangeTypeArrayValues),
  source: z.enum(RegulatoryUpdateSourceArrayValues),
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  statutoryReference: z.string().nullable().optional(),
  effectiveDate: z.coerce.date().nullable().optional(),
  sourceUrl: z.string().url("Must be a valid URL").nullable().optional().or(z.literal("")),
  impactAssessment: z.string().nullable().optional(),
  actionRequired: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(RegulatoryUpdateStatusArrayValues).optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  update: {
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
  };
};

export const postRegulatoryUpdateCreate = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/regulatory-update/create`, {
    method: "POST",
    body: JSON.stringify(validatedInput),
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