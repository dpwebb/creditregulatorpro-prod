import { z } from "zod";

import { DynamicScanningRule } from "../../helpers/schema";
import { Selectable } from "kysely";

export const schema = z.object({
  regulatoryUpdateId: z.number(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  success: boolean;
  rule: Selectable<DynamicScanningRule>;
};

export const postScanningRuleGenerate = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/scanning-rule/generate`, {
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