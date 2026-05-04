import { z } from "zod";
import type { MockLifecycleJobRecord } from "./types";

export const schema = z.object({
  initialReportPath: z.string().trim().min(1, "Initial report path is required"),
  followupReportPath: z.string().trim().min(1).optional(),
  simulateDays: z.coerce.number().int().min(1).max(365).default(30),
  packetCount: z.coerce.number().int().min(1).max(10).default(2),
  strict: z.boolean().default(false),
  useDbAssist: z.boolean().default(true),
  baseUrl: z.string().trim().url().default("http://localhost:3333"),
  origin: z.string().trim().url().default("https://staging.creditregulatorpro.com"),
  email: z.string().trim().email().optional(),
  password: z.string().trim().min(8).optional(),
  displayName: z.string().trim().min(1).max(120).optional(),
  legalNameSignature: z.string().trim().min(1).max(120).optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  job: MockLifecycleJobRecord;
};

export const postAdminMockLifecycleRun = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);

  const result = await fetch(`/_api/admin/mock-lifecycle/run`, {
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
    throw new Error(errorObject.error ?? "Failed to start lifecycle run");
  }

  return JSON.parse(await result.text()) as OutputType;
};

