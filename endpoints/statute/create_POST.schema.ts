import { z } from "zod";
import { readStatuteRequestError } from "./requestError";

export const schema = z.object({
  jurisdiction: z.string().trim().min(1, "Jurisdiction is required"),
  code: z.string().trim().min(1, "Code is required"),
  description: z.string().trim().min(1, "Description is required"),
  responseClockDays: z.number().int().positive("Response clock days must be positive"),
  effectiveDate: z.coerce.date(),
  sourceUrl: z.string().trim().url("Source URL must be a valid URL"),
  sectionReference: z.string().trim().min(1, "Section reference is required"),
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
    throw new Error(await readStatuteRequestError(result));
  }
  return JSON.parse(await result.text());
};
