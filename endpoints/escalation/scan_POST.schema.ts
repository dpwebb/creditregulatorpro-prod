import { z } from "zod";


export const schema = z.object({});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  obligationsReadyForEscalation: {
    id: number;
    tradelineId: number | null;
    userId: number | null;
    disputeVector: string | null;
    responseDeadline: Date | null;
  }[];
};

export const scanEscalations = async (init?: RequestInit): Promise<OutputType> => {
  const result = await fetch(`/_api/escalation/scan`, {
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