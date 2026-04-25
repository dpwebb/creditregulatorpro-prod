import { z } from "zod";

export const schema = z.object({
  userId: z.number().optional()
});

export type InputType = z.infer<typeof schema>;

export type HiddenRiskItem = {
  id: number;
  violationCategory: string;
  severity: string;
  userExplanation: string | null;
  recommendedAction: string | null;
  detectedAt: Date | null;
  confidenceScore: number | null;
  tradelineId: number;
  creditorName: string | null;
  bureauName: string | null;
  hasPacket: boolean;
};

export type OutputType = {
  risks: HiddenRiskItem[];
  aggregate: {
    totalCount: number;
    errorCount: number;
    warningCount: number;
    countWithPacket: number;
    uniqueUserCount?: number;
  };
};

export const getHiddenRiskList = async (params: InputType = {}, init?: RequestInit): Promise<OutputType> => {
  const url = new URL(`/_api/hidden-risk/list`, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');

  if (params.userId !== undefined) {
    url.searchParams.append('userId', params.userId.toString());
  }

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
    throw new Error(errorObject.error || "Failed to fetch hidden risks");
  }
  
  const data = JSON.parse(await result.text());
  
  // Transform date strings to Date objects
  return {
    ...data,
    risks: data.risks.map((risk: any) => ({
      ...risk,
      detectedAt: risk.detectedAt ? new Date(risk.detectedAt) : null,
    }))
  };
};