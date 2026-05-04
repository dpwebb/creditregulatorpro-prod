import { z } from "zod";

export const schema = z.object({
  jobId: z.string().trim().min(1, "jobId is required"),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  report: Record<string, unknown>;
};

export const getAdminMockLifecycleReport = async (
  params: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const validated = schema.parse(params);
  const searchParams = new URLSearchParams({
    jobId: validated.jobId,
  });

  const result = await fetch(`/_api/admin/mock-lifecycle/report?${searchParams.toString()}`, {
    method: "GET",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!result.ok) {
    const errorObject = JSON.parse(await result.text());
    throw new Error(errorObject.error ?? "Failed to fetch lifecycle report");
  }

  return JSON.parse(await result.text()) as OutputType;
};

