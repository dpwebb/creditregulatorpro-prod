import { z } from "zod";

export const schema = z.object({
  issueId: z
    .string()
    .trim()
    .min(1, "Issue ID is required.")
    .max(80, "Issue ID must be 80 characters or fewer."),
  title: z
    .string()
    .trim()
    .min(3, "Issue title is required.")
    .max(160, "Issue title must be 160 characters or fewer."),
  codexReport: z
    .string()
    .trim()
    .min(1, "Codex report is required.")
    .max(50000, "Codex report must be 50000 characters or fewer."),
  generatedPrompt: z
    .string()
    .trim()
    .max(30000, "Generated prompt must be 30000 characters or fewer.")
    .optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  logId: string;
  loggedAt: string;
  stored: true;
  logTarget: "server-jsonl";
};

export const postAdminBetaTestingHubLog = async (
  body: InputType,
  init?: RequestInit,
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch("/_api/admin/beta-testing-hub/log", {
    method: "POST",
    body: JSON.stringify(validatedInput),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const responseText = await result.text();
  const responseJson = responseText ? JSON.parse(responseText) : {};

  if (!result.ok) {
    throw new Error(responseJson.error ?? "Failed to log Codex report");
  }

  return responseJson as OutputType;
};
