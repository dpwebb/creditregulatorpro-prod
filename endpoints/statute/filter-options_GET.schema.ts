import { z } from "zod";


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
    const errorObject = JSON.parse(await result.text());
    throw new Error(errorObject.error);
  }
  return JSON.parse(await result.text());
};
