import { z } from "zod";
import superjson from "superjson";

export const schema = z.object({
  userId: z.number().optional(),
});

export type InputType = z.infer<typeof schema>;

export type AuditFindingSeverity = "INFO" | "WARNING" | "ERROR";

export type AuditFinding = {
  category: string;
  severity: AuditFindingSeverity;
  endpoint: string;
  field: string;
  expected: string;
  actual: string;
  userId?: number;
  description: string;
};

export type AuditReport = {
  runAt: string;
  totalChecks: number;
  passed: number;
  failed: number;
  findings: AuditFinding[];
};

export type OutputType = AuditReport;

export const postSemanticAudit = async (
  body: z.infer<typeof schema>,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/admin/diagnostic/semantic-audit`, {
    method: "POST",
    body: superjson.stringify(validatedInput),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }

  return superjson.parse<OutputType>(await result.text());
};