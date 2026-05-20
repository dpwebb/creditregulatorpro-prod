import { z } from "zod";
import { RETENTION_APPLY_CONFIRMATION } from "../../helpers/retentionApplyGuard";

export { RETENTION_APPLY_CONFIRMATION };

export const schema = z.object({
  mode: z.enum(["preview", "apply"]).default("preview"),
  confirmation: z.string().optional(),
}).strict().superRefine((input, ctx) => {
  if (input.mode !== "apply") return;
  if (input.confirmation === RETENTION_APPLY_CONFIRMATION) return;

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["confirmation"],
    message: `Retention apply requires confirmation "${RETENTION_APPLY_CONFIRMATION}".`,
  });
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

/**
 * Client helper for calling the retention cron endpoint.
 * Typically called by an external cron service, not the frontend client.
 */
export const postAutoPurge = async (
  token: string,
  body?: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body ?? {});
  const result = await fetch(`/_api/retention/auto-purge`, {
    method: "POST",
    body: JSON.stringify(validatedInput),
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
