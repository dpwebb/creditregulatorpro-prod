import { z } from "zod";


export const schema = z.object({});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  jurisdictions: string[];
  codes: string[];
  topics: string[];
  statuses: Array<"ACTIVE" | "AMENDED" | "REPEALED">;
};

async function readErrorMessage(result: Response): Promise<string> {
  const fallback = `Request failed (${result.status})`;
  const text = await result.text();
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error;
    }
  } catch {
    // Non-JSON response body.
  }
  return text.trim() || fallback;
}

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
    throw new Error(await readErrorMessage(result));
  }
  return JSON.parse(await result.text());
};
