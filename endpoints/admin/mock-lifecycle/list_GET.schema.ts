import { z } from "zod";
import type { MockLifecycleJobRecord } from "./types";

export const schema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(25),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  jobs: MockLifecycleJobRecord[];
};

export const getAdminMockLifecycleList = async (
  params?: Partial<InputType>,
  init?: RequestInit
): Promise<OutputType> => {
  const validated = schema.parse(params ?? {});
  const searchParams = new URLSearchParams({
    limit: String(validated.limit),
  });

  const result = await fetch(`/_api/admin/mock-lifecycle/list?${searchParams.toString()}`, {
    method: "GET",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!result.ok) {
    const errorObject = JSON.parse(await result.text());
    throw new Error(errorObject.error ?? "Failed to fetch lifecycle run list");
  }

  return JSON.parse(await result.text()) as OutputType;
};

