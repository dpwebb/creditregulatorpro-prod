import { z } from "zod";


export const schema = z.object({
  versionId: z.number(), // statute_version.id
  description: z.string().nullable().optional(),
  responseClockDays: z.number().positive().nullable().optional(),
  effectiveDate: z.coerce.date().nullable().optional(),
  supersededDate: z.coerce.date().nullable().optional(),
  sourceUrl: z.string().url().nullable().optional(),
  sectionReference: z.string().nullable().optional(),
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

export const postStatuteUpdate = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/statute/update`, {
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