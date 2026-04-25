import { z } from "zod";

import { Selectable } from "kysely";
import { Tradeline } from "../../helpers/schema";

export const schema = z.object({
  bureauId: z.number().nullable().optional(),
  creditorId: z.number().nullable().optional(),
  accountNumber: z.string().min(1, "Account number is required"),
  accountType: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  balance: z.number().nullable().optional(),
  openedDate: z.coerce.date().nullable().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  tradeline: Selectable<Tradeline>;
};

export const postTradelineCreate = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/tradeline/create`, {
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