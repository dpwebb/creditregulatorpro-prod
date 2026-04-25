import { z } from "zod";

import { Selectable } from "kysely";
import { CreditorObligationTest } from "../../helpers/schema";

export const schema = z.object({
  id: z.number(),
  responseText: z.string().optional(),
  responseReceived: z.boolean(),
  responseDate: z.coerce.date().optional(),
  notes: z.string().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  obligationTest: Selectable<CreditorObligationTest>;
  deficiencies: string[];
  timingDrift: number;
  nextAction: string;
  autoRotated: boolean;
  isExhausted: boolean;
};

export const updateCreditorValidation = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/creditor-validation/update`, {
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