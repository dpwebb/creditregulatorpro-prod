import { z } from "zod";

// No input required for the auto-purge trigger itself, authentication is handled via headers/query
export const schema = z.object({});

export type InputType = z.infer<typeof schema>;

export type RetentionSummary = {
  deletedPassExtractions: number;
  deletedBankruptcyRecords: number;
  deletedDiscriminationClaims: number;
  deletedObligationChallengeLogs: number;
  deletedTradelinePaymentHistories: number;
  deletedPacketComplianceAudits: number;
  deletedDeadlineEvents: number;
  deletedEvidenceAttachments: number;
  deletedSuccessMetrics: number;
  deletedMetro2Logs: number;
  deletedObligationInstances: number;
  deletedEvidenceEvents: number;
  deletedPackets: number;
  deletedCreditorObligationTests: number;
  deletedReportArtifacts: number;
  deletedTradelines: number;
  success: boolean;
  message?: string;
};

export type OutputType = RetentionSummary;

/**
 * Client helper for calling the auto-purge endpoint.
 * Typically called by an external cron service, not the frontend client.
 */
export const postAutoPurge = async (
  token: string,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/retention/auto-purge`, {
    method: "POST",
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!result.ok) {
    const errorObject = await result.json() as { error: string };
    throw new Error(errorObject.error);
  }
  return result.json() as Promise<OutputType>;
};