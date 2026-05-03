import { z } from "zod";
import { readStatuteRequestError } from "./requestError";

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
    throw new Error(await readStatuteRequestError(result));
  }
  return JSON.parse(await result.text());
};
