import { z } from "zod";

export const schema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export type InputType = z.infer<typeof schema>;

export type AiAssistRunEntry = {
  id: number;
  featureKey: string;
  subjectType: string;
  subjectId: number | null;
  userId: number | null;
  provider: string;
  model: string | null;
  status: "disabled" | "unavailable" | "ok" | "failed" | string;
  inputHash: string;
  outputJson: unknown | null;
  errorCode: string | null;
  createdAt: string;
};

export type OutputType = {
  runs: AiAssistRunEntry[];
  total: number;
};

export const getAdminAiAssistRuns = async (
  params: Partial<InputType> = {},
  init?: RequestInit,
): Promise<OutputType> => {
  const searchParams = new URLSearchParams();
  if (params.limit) searchParams.append("limit", params.limit.toString());
  if (params.offset) searchParams.append("offset", params.offset.toString());

  const result = await fetch(`/_api/admin/ai-assist/runs?${searchParams.toString()}`, {
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

  return JSON.parse(await result.text()) as OutputType;
};
