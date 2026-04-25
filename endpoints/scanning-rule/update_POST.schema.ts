import { z } from "zod";

import { DynamicRuleStatusArrayValues, ViolationCategoryArrayValues } from "../../helpers/schema";
import { RuleDefinitionSchema } from "../../helpers/dynamicRuleGenerator";

export const schema = z.object({
  id: z.number(),
  status: z.enum(DynamicRuleStatusArrayValues).optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  ruleDefinition: RuleDefinitionSchema.optional(),
  violationCategory: z.enum(ViolationCategoryArrayValues).optional(),
  severity: z.string().optional(),
  confidenceScore: z.number().optional(),
  userExplanationTemplate: z.string().optional(),
  recommendedActionTemplate: z.string().optional(),
  statutoryBasis: z.string().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  success: boolean;
};

export const postScanningRuleUpdate = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/scanning-rule/update`, {
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