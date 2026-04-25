import { z } from "zod";

import { EnforcementMechanismTypeArrayValues, EnforcementMechanismType } from "../../helpers/schema";

export const schema = z.object({
  jurisdiction: z.string().min(1, "Jurisdiction is required"),
  mechanismType: z.enum(EnforcementMechanismTypeArrayValues),
  name: z.string().min(1, "Name is required"),
  description: z.string().min(1, "Description is required"),
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

export const postEnforcementMechanismCreate = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/enforcement-mechanism/create`, {
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