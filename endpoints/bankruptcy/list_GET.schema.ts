import { z } from "zod";

import { Selectable } from "kysely";
import { BankruptcyRecord, BankruptcyStatusArrayValues, BankruptcyTypeArrayValues, CanadianProvinceArrayValues } from "../../helpers/schema";

export const schema = z.object({
  status: z.enum(BankruptcyStatusArrayValues).optional(),
  province: z.enum(CanadianProvinceArrayValues).optional(),
  type: z.enum(BankruptcyTypeArrayValues).optional(),
  limit: z.coerce.number().min(1).optional(),
  offset: z.coerce.number().min(0).optional(),
});

export type InputType = z.infer<typeof schema>;

export type BankruptcyRecordWithDetails = Selectable<BankruptcyRecord> & {
  accountNumber: string | null;
  accountType: string | null;
  bureauName: string | null;
};

export type OutputType = {
  records: BankruptcyRecordWithDetails[];
  total: number;
};

export const getBankruptcyList = async (params?: InputType, init?: RequestInit): Promise<OutputType> => {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.province) searchParams.set("province", params.province);
  if (params?.type) searchParams.set("type", params.type);
  if (params?.limit !== undefined) searchParams.set("limit", params.limit.toString());
  if (params?.offset !== undefined) searchParams.set("offset", params.offset.toString());

  const result = await fetch(`/_api/bankruptcy/list?${searchParams.toString()}`, {
    method: "GET",
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