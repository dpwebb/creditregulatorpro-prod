import { z } from "zod";

export const schema = z.object({
  confirmDelete: z.boolean(),
});

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

export const postRetentionEnforcement = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/admin/retention`, {
    method: "POST",
    body: JSON.stringify(validatedInput),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!result.ok) {
    const errorObject = await result.json() as { error: string };
    throw new Error(errorObject.error);
  }
  return result.json() as Promise<OutputType>;
};