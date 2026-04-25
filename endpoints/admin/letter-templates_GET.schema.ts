import { z } from "zod";
import { Selectable } from "kysely";
import { LetterTemplate, LetterTemplateCategoryArrayValues } from "../../helpers/schema";
import superjson from "superjson";

export const schema = z.object({
  category: z.enum(LetterTemplateCategoryArrayValues).optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = Selectable<LetterTemplate>[];

export const getLetterTemplates = async (
  query: InputType = {},
  init?: RequestInit
): Promise<OutputType> => {
  const params = new URLSearchParams();
  if (query.category) params.append("category", query.category);

  const result = await fetch(`/_api/admin/letter-templates?${params.toString()}`, {
    method: "GET",
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