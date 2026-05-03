import { z } from "zod";


export const schema = z.object({
  bytesBase64: z.string().min(1, "File data is required"),
  fileName: z.string().min(1, "Filename is required"),
  mimeType: z.string().min(1, "Mime type is required"),
  region: z.literal("CA"),
});

export type InputType = z.infer<typeof schema>;

export type SampleProblem = {
  type: string;
  title: string;
  detail: string;
  solution: string;
  urgency: string;
};

export type ExtractedAccountSummary = {
  creditorName: string;
  accountType: string | null;
  status: string | null;
  balance: number | null;
  openedDate: string | null;
  reportedDate: string | null;
  closedDate: string | null;
  lastPaymentDate: string | null;
};

export type OutputType = {
  problemCount: number;
  sampleProblems: SampleProblem[];
  tradelineCount: number;
  extractedAccounts: ExtractedAccountSummary[];
};

export const postAnonymousReport = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/ingest/anonymous-report`, {
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
    throw new Error(errorObject.error || "Failed to process anonymous report");
  }

  return JSON.parse(await result.text());
};
