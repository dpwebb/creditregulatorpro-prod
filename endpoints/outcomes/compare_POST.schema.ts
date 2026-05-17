import { z } from "zod";

import type { OutcomeComparisonRunDetail } from "../../helpers/outcomeTrackingService";

export const comparisonScopeSchema = z.enum(["report_to_report", "packet_findings", "response_only"]);

export const schema = z.object({
  previousReportArtifactId: z.coerce.number().int().positive(),
  laterReportArtifactId: z.coerce.number().int().positive().nullable().optional(),
  packetId: z.coerce.number().int().positive().nullable().optional(),
  comparisonScope: comparisonScopeSchema,
  creditorObligationTestIds: z.array(z.coerce.number().int().positive()).optional(),
  disputePacketFindingIds: z.array(z.coerce.number().int().positive()).optional(),
  response: z
    .object({
      packetId: z.coerce.number().int().positive().nullable().optional(),
      responseReceivedAt: z.string().nullable().optional(),
      responseType: z.string().nullable().optional(),
      source: z.enum(["bureau_response", "collection_agency_response", "manual_record"]).optional(),
    })
    .nullable()
    .optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  comparisonRun: OutcomeComparisonRunDetail;
};

export const postOutcomeCompare = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch("/_api/outcomes/compare", {
    method: "POST",
    body: JSON.stringify(validatedInput),
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
