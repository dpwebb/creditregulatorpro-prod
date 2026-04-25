import { z } from "zod";

import { DynamicRuleStatusArrayValues, DynamicScanningRule } from "../../helpers/schema";
import { Selectable } from "kysely";

export const schema = z.object({
  status: z.enum(DynamicRuleStatusArrayValues).optional(),
});

export type InputType = z.infer<typeof schema>;

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