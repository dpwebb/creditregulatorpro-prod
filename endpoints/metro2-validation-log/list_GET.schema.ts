import { z } from "zod";

import { Selectable } from "kysely";
import { Metro2ValidationLog, ValidationSeverityArrayValues } from "../../helpers/schema";

export const METRO2_VALIDATION_LOG_LIST_DEFAULT_LIMIT = 50;
export const METRO2_VALIDATION_LOG_LIST_MAX_LIMIT = 100;

export const schema = z.object({
  tradelineId: z.number().optional(),
  severity: z.enum(ValidationSeverityArrayValues).optional(),
  category: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(METRO2_VALIDATION_LOG_LIST_MAX_LIMIT).default(METRO2_VALIDATION_LOG_LIST_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

export type InputType = Partial<z.infer<typeof schema>>;

export type OutputType = {
  logs: Selectable<Metro2ValidationLog>[];
};

export const getMetro2ValidationLogs = async (params: InputType = {}, init?: RequestInit): Promise<OutputType> => {
  const url = new URL(`/_api/metro2-validation-log/list`, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  
  if (params.tradelineId !== undefined) url.searchParams.append('tradelineId', params.tradelineId.toString());
  if (params.severity !== undefined) url.searchParams.append('severity', params.severity);
  if (params.category !== undefined) url.searchParams.append('category', params.category);
  if (params.limit !== undefined) url.searchParams.append('limit', params.limit.toString());
  if (params.offset !== undefined) url.searchParams.append('offset', params.offset.toString());

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
