import { z } from "zod";

export const betaIssueSeverityValues = ["P0", "P1", "P2", "P3"] as const;

const optionalTrimmedString = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be ${max} characters or fewer.`).optional();

export const schema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Issue title is required.")
    .max(160, "Issue title must be 160 characters or fewer."),
  severity: z.enum(betaIssueSeverityValues).default("P2"),
  area: optionalTrimmedString(120, "Area"),
  stagingUrl: z
    .string()
    .trim()
    .url("Staging URL must be a valid URL.")
    .max(500, "Staging URL must be 500 characters or fewer.")
    .optional(),
  observed: z
    .string()
    .trim()
    .min(1, "Observed behavior is required.")
    .max(5000, "Observed behavior must be 5000 characters or fewer."),
  expected: optionalTrimmedString(3000, "Expected behavior"),
  reproductionSteps: optionalTrimmedString(5000, "Reproduction steps"),
  notes: optionalTrimmedString(3000, "Notes"),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  issueId: string;
  generatedAt: string;
  prompt: string;
  promptSource: "deterministic-template";
  stagingOnly: true;
  readinessCommand: "pnpm run beta-live:certify";
  readinessAuthority: "SAFE_FOR_BETA_LIVE=true/false";
};

export const postAdminBetaTestingHubPrompt = async (
  body: InputType,
  init?: RequestInit,
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch("/_api/admin/beta-testing-hub/prompt", {
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
    throw new Error(responseJson.error ?? "Failed to generate beta FIX prompt");
  }

  return responseJson as OutputType;
};
