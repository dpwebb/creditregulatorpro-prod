import { z } from "zod";

import { Selectable } from "kysely";
import { BankruptcyRecord, BankruptcyStatusArrayValues, BankruptcyTypeArrayValues, CanadianProvinceArrayValues } from "../../helpers/schema";

export const BANKRUPTCY_LIST_DEFAULT_LIMIT = 50;
export const BANKRUPTCY_LIST_MAX_LIMIT = 100;

export const schema = z.object({
  status: z.enum(BankruptcyStatusArrayValues).optional(),
  province: z.enum(CanadianProvinceArrayValues).optional(),
  type: z.enum(BankruptcyTypeArrayValues).optional(),
  limit: z.coerce.number().int().min(1).max(BANKRUPTCY_LIST_MAX_LIMIT).default(BANKRUPTCY_LIST_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

export type InputType = Partial<z.infer<typeof schema>>;

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
