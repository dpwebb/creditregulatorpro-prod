import { z } from "zod";
import superjson from "superjson";

export const schema = z.object({
  templateId: z.coerce.number().int().positive(),
});

export type InputType = z.infer<typeof schema>;

export type LetterTemplateHistoryItem = {
  auditLogId: number;
  templateId: number;
  actionType: string;
  mode: string | null;
  changedFields: string[];
  warnings: string[];
  timestamp: Date;
  userId: number | null;
  userDisplayName: string | null;
  userEmail: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

export type OutputType = {
  history: LetterTemplateHistoryItem[];
};

export const getLetterTemplateHistory = async (
  query: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const params = new URLSearchParams();
  params.append("templateId", String(query.templateId));

  const result = await fetch(`/_api/admin/letter-template/history?${params.toString()}`, {
    method: "GET",
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
