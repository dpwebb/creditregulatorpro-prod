import { z } from "zod";

import { Selectable } from "kysely";
import { ComplianceConfig, ViolationCategoryArrayValues } from "../../helpers/schema";

export const schema = z.object({
  configs: z.array(
    z.object({
      violationCategory: z.enum(ViolationCategoryArrayValues),
      enabled: z.boolean(),
      confidenceThreshold: z.number().min(0).max(100).nullable(),
      userExplanationTemplate: z.string().nullable(),
      recommendedActionTemplate: z.string().nullable(),
    })
  ),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = Selectable<ComplianceConfig>[];

export const postComplianceConfigs = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/admin/compliance-config`, {
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