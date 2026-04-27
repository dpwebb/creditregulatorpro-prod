import { z } from "zod";

import { Selectable } from "kysely";
import { CreditorObligationTest } from "../../helpers/schema";

export const schema = z.object({
  violationId: z.number(),
  status: z.enum(["dismissed", "verified"]),
  reason: z.string().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  obligationTest: Selectable<CreditorObligationTest>;
};

export const postDismissCreditorValidation = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/creditor-validation/dismiss`, {
    method: "POST",
    body: JSON.stringify(body),
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