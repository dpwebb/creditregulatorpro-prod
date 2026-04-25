import { z } from "zod";


// No input parameters required as it scans the database state
export const schema = z.object({});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  success: boolean;
  summary: {
    scannedCount: number;
    triggeredCount: number;
    errors: {
      id: number;
      error: string;
    }[];
  };
};

export const postAutoTriggerEscalation = async (init?: RequestInit): Promise<OutputType> => {
  const result = await fetch(`/_api/escalation/auto-trigger`, {
    method: "POST",
    body: JSON.stringify({}),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  
  if (!result.ok) {
    const errorObject = JSON.parse(await result.text());
    throw new Error(errorObject.error);
  }
  return JSON.parse(await result.text());
};