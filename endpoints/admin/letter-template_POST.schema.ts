import { z } from "zod";
import { Selectable } from "kysely";
import { LetterTemplate, LetterTemplateCategoryArrayValues } from "../../helpers/schema";
import superjson from "superjson";

export const schema = z.object({
  id: z.number().optional(),
  category: z.enum(LetterTemplateCategoryArrayValues),
  templateKey: z.string().min(1),
  label: z.string().min(1),
  mode: z.enum(["DRAFT", "PUBLISH", "ROLLBACK"]).optional(),
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

export type OutputType = Selectable<LetterTemplate>;

export const postLetterTemplate = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/admin/letter-template`, {
    method: "POST",
    body: superjson.stringify(validatedInput),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }

  return superjson.parse<OutputType>(await result.text());
};
