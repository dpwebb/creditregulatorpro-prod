import { z } from "zod";

import { Selectable } from "kysely";
import { BankruptcyRecord, BankruptcyTypeArrayValues, CanadianProvinceArrayValues } from "../../helpers/schema";

export const schema = z.object({
  tradelineId: z.number().nullable().optional(),
  bankruptcyType: z.enum(BankruptcyTypeArrayValues),
  province: z.enum(CanadianProvinceArrayValues),
    filingDate: z.coerce.date(),
  dischargeDate: z.coerce.date().nullable().optional(),
  completionDate: z.coerce.date().nullable().optional(),
  caseNumber: z.string().nullable().optional(),
  filingCourt: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
}).refine((data) => {
  if (data.dischargeDate && data.filingDate > data.dischargeDate) {
    return false;
  }
  if (data.completionDate && data.filingDate > data.completionDate) {
    return false;
  }
  return true;
}, {
  message: "Filing date must be before discharge or completion date",
  path: ["filingDate"],
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  record: Selectable<BankruptcyRecord>;
};

export const postBankruptcyCreate = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/bankruptcy/create`, {
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