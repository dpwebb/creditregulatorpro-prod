import { z } from "zod";
import type { MockLifecycleJobRecord } from "./types";

export const schema = z.object({
  jobId: z.string().trim().min(1, "jobId is required"),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  job: MockLifecycleJobRecord;
};

export const getAdminMockLifecycleStatus = async (
  params: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const validated = schema.parse(params);
  const searchParams = new URLSearchParams({
    jobId: validated.jobId,
  });

  const result = await fetch(`/_api/admin/mock-lifecycle/status?${searchParams.toString()}`, {
    method: "GET",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!result.ok) {
    const errorObject = JSON.parse(await result.text());
    throw new Error(errorObject.error ?? "Failed to fetch lifecycle run status");
  }

  return JSON.parse(await result.text()) as OutputType;
};

