import { z } from "zod";


export const schema = z.object({
  jurisdiction: z.string().min(1, "Jurisdiction is required"),
  code: z.string().min(1, "Code is required"),
  description: z.string().nullable().optional(),
  responseClockDays: z.number().positive("Response clock days must be positive").nullable().optional(),
  effectiveDate: z.coerce.date().nullable().optional(),
  sourceUrl: z.string().url().nullable().optional(),
  sectionReference: z.string().nullable().optional(),
  version: z.number().int().positive().optional(), // Optional, auto-increment if missing
});

export type InputType = z.infer<typeof schema>;

// Combined data from both statute and statute_version tables
export type OutputType = {
  statute: {
    id: number; // statute.id
    jurisdiction: string;
    code: string;
    versionId: number; // statute_version.id
    version: number;
    description: string | null;
    effectiveDate: Date | null;
    supersededDate: Date | null;
    responseClockDays: number | null;
    sourceUrl: string | null;
    sectionReference: string | null;
  };
};

export const postStatuteCreate = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/statute/create`, {
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