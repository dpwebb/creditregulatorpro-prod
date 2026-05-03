import { z } from "zod";
import { readStatuteRequestError } from "./requestError";

export const schema = z.object({});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  jurisdictions: string[];
  codes: string[];
  topics: string[];
  statuses: Array<"ACTIVE" | "AMENDED" | "REPEALED">;
};

export const getStatuteFilterOptions = async (init?: RequestInit): Promise<OutputType> => {
  const result = await fetch(`/_api/statute/filter-options`, {
    method: "GET",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!result.ok) {
    throw new Error(await readStatuteRequestError(result));
  }
  return JSON.parse(await result.text());
};
