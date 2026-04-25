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
  id: z.number(),
  title: z.string().min(1, "Title cannot be empty").optional(),
  description: z.string().min(1, "Description cannot be empty").optional(),
  changeType: z.enum(RegulatoryChangeTypeArrayValues).optional(),
  source: z.enum(RegulatoryUpdateSourceArrayValues).optional(),
  statutoryReference: z.string().nullable().optional(),
  effectiveDate: z.coerce.date().nullable().optional(),
  sourceUrl: z.string().url("Must be a valid URL").nullable().optional().or(z.literal("")),
  impactAssessment: z.string().nullable().optional(),
  actionRequired: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(RegulatoryUpdateStatusArrayValues).optional(),
  reviewedAt: z.coerce.date().nullable().optional(),
  reviewedBy: z.string().nullable().optional(),
  appliedAt: z.coerce.date().nullable().optional(),
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

export const postRegulatoryUpdateUpdate = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/regulatory-update/update`, {
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