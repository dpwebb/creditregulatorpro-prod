import { z } from "zod";

import { Selectable } from "kysely";
import { ObligationInstance } from "../../helpers/schema";
import type { BureauResponseClassification } from "../../helpers/bureauResponseClassifier";

export const schema = z.object({
  obligationInstanceId: z.number(),
  responseReceivedDate: z.string().datetime(), // ISO string
  responseStatus: z.string().min(1),
  responseLetterContent: z.string().optional(),
  responseMovDisclosed: z.boolean().optional(),
  responseMovDescription: z.string().optional(),
  responseItemsDisputed: z.array(z.string()).optional(),
  responseItemsAddressed: z.array(z.string()).optional(),
  responseDocumentationProvided: z.boolean().optional(),
  responseDocumentationTypes: z.array(z.string()).optional(),
  responseSenderAddress: z.string().optional(),
  responseAuthorizedSignature: z.boolean().optional(),
  responseSignatoryName: z.string().optional(),
  responseSignatoryTitle: z.string().optional(),
  runAudit: z.boolean().default(true),
});

export type InputType = z.infer<typeof schema>;

// We define a simplified type for the response because the raw Kysely types
// contain complex column definitions (ColumnType<...>) that don't match
// the plain objects returned by serialization.
// We use Selectable<ObligationInstance> to get the runtime types (Date, string, number etc)
export type ObligationInstanceResponse = Selectable<ObligationInstance>;

export type AnalysisResult = {
  deficiencies: string[];
  timingDrift: number;
  recommendedPath: "CONTINUE_SEQUENCE" | "ESCALATE_TO_FCAC" | "MARK_EXHAUSTED" | "RETRY";
  responsesReceived: number;
  nextVector: string | null;
} | null;

export type OutputType = {
  success: boolean;
  obligationInstance: ObligationInstanceResponse;
  auditFindings?: any[]; // Using any[] here to match the JSON type from DB, but effectively DetectedViolation[]
  analysisResult?: AnalysisResult;
  responseClassification: BureauResponseClassification;
};

export const recordResponse = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/obligation-instance/record-response`, {
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
