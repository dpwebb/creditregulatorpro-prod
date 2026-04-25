import { z } from "zod";


export const schema = z.object({
    scope: z.enum(['overall', 'vector', 'creditor', 'bureau', 'violation']).default('overall'),
});

export type InputType = z.infer<typeof schema>;

// Union type for different analytics outputs
export type OutputType = 
  | {
      totalChallenges: number;
      successRate: number;
      avgResponseDays: number;
      escalationRate: number;
      exhaustionRate: number;
    }
  | {
      vector: string;
      totalChallenges: number;
      successCount: number;
      successRate: number;
      avgResponseDays: number;
    }[]
  | {
      creditorId: number | null;
      creditorName: string;
      totalChallenges: number;
      successCount: number;
      successRate: number;
    }[]
  | {
      bureauId: number | null;
      bureauName: string;
      totalChallenges: number;
      successCount: number;
      successRate: number;
    }[]
  | {
      violationCategory: string;
      totalChallenges: number;
      successCount: number;
      successRate: number;
    }[];

export const getAnalytics = async (input: InputType, init?: RequestInit): Promise<OutputType> => {
  const params = new URLSearchParams();
  params.append("scope", input.scope);

  const result = await fetch(`/_api/success/analytics?${params.toString()}`, {
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