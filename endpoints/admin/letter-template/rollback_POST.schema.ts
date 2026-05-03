import { z } from "zod";
import superjson from "superjson";
import { Selectable } from "kysely";
import { LetterTemplate } from "../../../helpers/schema";

export const schema = z.object({
  templateId: z.number().int().positive(),
  auditLogId: z.number().int().positive(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  template: Selectable<LetterTemplate>;
};

export const postRollbackLetterTemplate = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/admin/letter-template/rollback`, {
    method: "POST",
    body: superjson.stringify(body),
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
