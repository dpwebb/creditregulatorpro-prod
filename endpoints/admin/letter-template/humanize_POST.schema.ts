import { z } from "zod";
import superjson from "superjson";

import { LetterTemplateCategoryArrayValues } from "../../../helpers/schema";
import type { LetterTemplateHumanizeResult } from "../../../helpers/letterTemplateHumanizeAssist";

export const schema = z.object({
  id: z.number().optional(),
  category: z.enum(LetterTemplateCategoryArrayValues),
  templateKey: z.string().min(1),
  label: z.string().min(1),
  isActive: z.boolean().default(true),
  subject: z.string().nullable().optional(),
  introduction: z.string().nullable().optional(),
  statutoryGrounds: z.string().nullable().optional(),
  requestedAction: z.string().nullable().optional(),
  statutoryTimeframe: z.string().nullable().optional(),
  consumerStatementRight: z.string().nullable().optional(),
  certification: z.string().nullable().optional(),
  closing: z.string().nullable().optional(),
  fullBodyOverride: z.string().nullable().optional(),
  statutoryReference: z.string().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
});

export type InputType = z.infer<typeof schema>;
export type OutputType = LetterTemplateHumanizeResult;

export const postHumanizeLetterTemplate = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/admin/letter-template/humanize`, {
    method: "POST",
    body: superjson.stringify(schema.parse(body)),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const responseText = await result.text();

  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(responseText);
    throw new Error(errorObject.error);
  }

  return superjson.parse<OutputType>(responseText);
};
