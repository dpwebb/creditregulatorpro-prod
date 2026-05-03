import { z } from "zod";

export const schema = z.object({
  versionId: z.coerce.number().int().positive(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  history: Array<{
    auditLogId: number;
    actionType: string;
    mode: string | null;
    timestamp: Date;
    userId: number | null;
    userDisplayName: string | null;
    userEmail: string | null;
    changedFields: string[];
    citation: string | null;
  }>;
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

export const getStatuteHistory = async (
  input: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const params = new URLSearchParams();
  params.append("versionId", String(input.versionId));

  const result = await fetch(`/_api/statute/history?${params.toString()}`, {
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
