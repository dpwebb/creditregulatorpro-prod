import { z } from "zod";


export const schema = z.object({});

export type PacketRecommendationActionPlan = {
  deterministic: true;
  ruleId: "packet-action-readiness-v1";
  primaryAction: "CREATE_PACKET" | "COMPLETE_PROFILE" | "UPDATE_BUREAU_CONTACT";
  status: "ready" | "blocked";
  ctaLabel: string;
  blockers: Array<{
    code: "missing_user_profile" | "missing_bureau_contact";
    label: string;
    fields: string[];
  }>;
};

export type OutputType =
  | {
      recommendations: Array<{
        tradelineId: number;
        tradelineName: string;
        bureauId: number | null;
        bureauName: string | null;
        violationId: number;
        violationCategory: string;
        violationDescription: string;
        suggestedDisputeVector: string | null;
        suggestedReasonCode: string;
        reasoning: string;
        score: number;
        confidenceLevel: "good" | "fair" | "procedural";
        actionPlan: PacketRecommendationActionPlan;
      }>;
      proceduralOptions: Array<{
        id: string;
        label: string;
        description: string;
        entityType: string;
        priority: string;
      }> | null;
      hasViolations: boolean;
      totalTradelines: number;
    }
  | { error: string };

export const getRecommendPacket = async (
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/packet/recommend`, {
    method: "GET",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  
  if (!result.ok) {
    const errorObject = JSON.parse(await result.text());
    throw new Error(errorObject.error || "Failed to fetch recommendations");
  }
  
  return JSON.parse(await result.text());
};
