import { z } from "zod";


export const schema = z.object({
  tradelineId: z.number(),
});

export type InputType = z.infer<typeof schema>;

export type VectorHistoryItem = {
  vector: string;
  usedDate: Date | null;
  obligationInstanceId: number;
  responseReceived: boolean;
  outcome: string | null;
  responseDate: Date | null;
};

export type VectorStats = {
  vector: string;
  totalUses: number;
  successRate: number; // 0-1
  lastUsedDate: Date | null;
};

export type OutputType = {
  history: VectorHistoryItem[];
  stats: VectorStats[];
  currentBlockedVector: string | null;
};

export const getRotationHistory = async (tradelineId: number, init?: RequestInit): Promise<OutputType> => {
  const params = new URLSearchParams({ tradelineId: tradelineId.toString() });
  const result = await fetch(`/_api/tradeline/rotation-history?${params.toString()}`, {
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