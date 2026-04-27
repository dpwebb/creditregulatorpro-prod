import { z } from "zod";

import { EnforcementMechanismType } from "../../helpers/schema";

export const schema = z.object({
  id: z.number(),
  name: z.string().min(1, "Name cannot be empty").optional(),
  description: z.string().min(1, "Description cannot be empty").optional(),
  statutoryReference: z.string().nullable().optional(),
  penaltyAmount: z.string().nullable().optional(),
  contactInfo: z.string().nullable().optional(),
  websiteUrl: z.string().url("Must be a valid URL").nullable().optional().or(z.literal("")),
  filingDeadlineDays: z.number().int().positive("Filing deadline days must be positive").nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  mechanism: {
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
  };
};

export const postEnforcementMechanismUpdate = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/enforcement-mechanism/update`, {
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