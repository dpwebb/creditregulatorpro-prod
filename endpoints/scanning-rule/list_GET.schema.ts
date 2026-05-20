import { z } from "zod";

import { DynamicRuleStatusArrayValues, DynamicScanningRule } from "../../helpers/schema";
import { Selectable } from "kysely";

export const SCANNING_RULE_LIST_DEFAULT_LIMIT = 50;
export const SCANNING_RULE_LIST_MAX_LIMIT = 100;

export const schema = z.object({
  status: z.enum(DynamicRuleStatusArrayValues).optional(),
  limit: z.coerce.number().int().min(1).max(SCANNING_RULE_LIST_MAX_LIMIT).default(SCANNING_RULE_LIST_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

export type InputType = Partial<z.infer<typeof schema>>;

export type ScanningRuleWithUpdate = Selectable<DynamicScanningRule> & {
  regulatoryUpdateTitle: string | null;
};

export type OutputType = {
  rules: ScanningRuleWithUpdate[];
};

export const getScanningRuleList = async (
  input?: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const url = new URL("/_api/scanning-rule/list", window.location.origin);
  if (input?.status) {
    url.searchParams.set("status", input.status);
  }
  if (input?.limit !== undefined) url.searchParams.set("limit", input.limit.toString());
  if (input?.offset !== undefined) url.searchParams.set("offset", input.offset.toString());

  const result = await fetch(url.toString(), {
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
