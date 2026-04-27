import { z } from "zod";


export const schema = z.object({});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  agents: {
    id: number;
    displayName: string;
  }[];
};

export const getSupportAgents = async (
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/support-ticket/agents`, {
    method: "GET",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!result.ok) {
    const errorData = await result.json();
    throw new Error(errorData.error || "Request failed");
  }
  return JSON.parse(await result.text());
};