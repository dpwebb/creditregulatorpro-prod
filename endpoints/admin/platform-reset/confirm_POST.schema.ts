import { z } from "zod";
import {
  ADMIN_PLATFORM_RESET_HEADER,
  platformResetDatabaseSchema,
  PLATFORM_RESET_CONFIRMATION_PHRASE,
  resetModeSchema,
  type PlatformResetDatabase,
  type PlatformResetResult,
} from "./dry-run_POST.schema";

export { ADMIN_PLATFORM_RESET_HEADER, PLATFORM_RESET_CONFIRMATION_PHRASE };

export const schema = z.object({
  mode: resetModeSchema.default("hard"),
  confirmation: z.string(),
  expectedDatabase: platformResetDatabaseSchema,
  baseUrl: z.string().url().optional(),
}).strict().superRefine((input, ctx) => {
  if (input.confirmation === PLATFORM_RESET_CONFIRMATION_PHRASE) return;

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["confirmation"],
    message: `Platform reset requires confirmation "${PLATFORM_RESET_CONFIRMATION_PHRASE}".`,
  });
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  success: boolean;
  result: PlatformResetResult;
  auditLogIds: {
    started: number;
    completed: number;
  };
};

async function parseApiError(response: Response): Promise<Error> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { error?: string };
    return new Error(parsed.error || "Platform reset request failed.");
  } catch {
    return new Error(text || "Platform reset request failed.");
  }
}

export const postAdminPlatformResetConfirm = async (
  body: InputType,
  init?: RequestInit,
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/admin/platform-reset/confirm`, {
    method: "POST",
    body: JSON.stringify(validatedInput),
    ...init,
    headers: {
      "Content-Type": "application/json",
      [ADMIN_PLATFORM_RESET_HEADER]: "1",
      ...(init?.headers ?? {}),
    },
  });

  if (!result.ok) {
    throw await parseApiError(result);
  }

  return result.json() as Promise<OutputType>;
};

export type { PlatformResetDatabase, PlatformResetResult };
