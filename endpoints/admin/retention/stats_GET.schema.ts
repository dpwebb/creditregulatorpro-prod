import { z } from "zod";


export const schema = z.object({});

export type InputType = z.infer<typeof schema>;

export type RetentionStats = {
  eligibleForDeletion: number;
  breakdown: {
    table: string;
    count: number;
  }[];
  lastRun: Date | null;
};

export type OutputType = RetentionStats;

export const getRetentionStats = async (
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/admin/retention/stats`, {
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