import { z } from "zod";

import { Selectable } from "kysely";
import { CreditorObligationTest, CraObligationTypeArrayValues } from "../../helpers/schema";

export const schema = z.object({
  tradelineId: z.number(),
  creditorId: z.number(),
  obligationType: z.enum(CraObligationTypeArrayValues),
  metro2Version: z.string().optional(),
  notes: z.string().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  obligationTest: Selectable<CreditorObligationTest>;
};

export const createCreditorValidation = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/creditor-validation/create`, {
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