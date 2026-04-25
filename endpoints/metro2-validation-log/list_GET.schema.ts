import { z } from "zod";

import { Selectable } from "kysely";
import { Metro2ValidationLog, ValidationSeverityArrayValues } from "../../helpers/schema";

export const schema = z.object({
  tradelineId: z.number().optional(),
  severity: z.enum(ValidationSeverityArrayValues).optional(),
  category: z.string().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  logs: Selectable<Metro2ValidationLog>[];
};

export const getMetro2ValidationLogs = async (params: InputType = {}, init?: RequestInit): Promise<OutputType> => {
  const url = new URL(`/_api/metro2-validation-log/list`, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  
  if (params.tradelineId !== undefined) url.searchParams.append('tradelineId', params.tradelineId.toString());
  if (params.severity !== undefined) url.searchParams.append('severity', params.severity);
  if (params.category !== undefined) url.searchParams.append('category', params.category);

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