import { z } from "zod";

import { Selectable } from "kysely";
import { BankruptcyRecord, BankruptcyStatusArrayValues, BankruptcyTypeArrayValues, CanadianProvinceArrayValues } from "../../helpers/schema";

export const schema = z.object({
  id: z.number(),
  tradelineId: z.number().nullable().optional(),
  bankruptcyType: z.enum(BankruptcyTypeArrayValues).optional(),
  province: z.enum(CanadianProvinceArrayValues).optional(),
  status: z.enum(BankruptcyStatusArrayValues).optional(),
  filingDate: z.coerce.date().optional(),
  dischargeDate: z.coerce.date().nullable().optional(),
  completionDate: z.coerce.date().nullable().optional(),
  caseNumber: z.string().nullable().optional(),
  filingCourt: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  record: Selectable<BankruptcyRecord>;
};

export const postBankruptcyUpdate = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/bankruptcy/update`, {
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