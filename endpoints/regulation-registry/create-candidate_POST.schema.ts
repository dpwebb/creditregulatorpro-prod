import { z } from "zod";
import { RegulationCategoryArrayValues } from "../../helpers/schema";

export const regulationDraftSchema = z.object({
  regulationId: z.string().min(1),
  jurisdiction: z.string().min(1),
  authoritySource: z.string().min(1),
  regulationTitle: z.string().min(1),
  sectionNumber: z.string().min(1),
  subsection: z.string().nullable().optional(),
  shortTitle: z.string().min(1),
  fullText: z.string().min(1),
  plainLanguageSummary: z.string().min(1),
  officialSourceUrl: z.string().url(),
  publicationDate: z.coerce.date().nullable().optional(),
  effectiveDate: z.coerce.date().nullable().optional(),
  repealSupersededStatus: z.string().nullable().optional(),
  regulationCategory: z.enum(RegulationCategoryArrayValues),
  tags: z.array(z.string()).optional(),
  citationFormat: z.string().min(1),
  sourceDocumentUrl: z.string().url().nullable().optional(),
});

export const schema = regulationDraftSchema;

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  candidate: unknown;
  skippedReason: string | null;
};

export const postRegulationCandidateCreate = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch("/_api/regulation-registry/create-candidate", {
    method: "POST",
    body: JSON.stringify(validatedInput),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!result.ok) {
    const errorObject = JSON.parse(await result.text()) as { error: string };
    throw new Error(errorObject.error);
  }
  return JSON.parse(await result.text()) as OutputType;
};
