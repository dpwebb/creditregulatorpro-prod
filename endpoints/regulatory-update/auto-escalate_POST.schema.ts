import { z } from "zod";


export const schema = z.object({});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  escalated: number;
  notificationsCreated: number;
  statutesLinked: number;
};

export const postRegulatoryUpdateAutoEscalate = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/regulatory-update/auto-escalate`, {
    method: "POST",
    body: JSON.stringify(validatedInput),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!result.ok) {
    const errorObject = JSON.parse(await result.text()) as { error: string };
    throw new Error(errorObject.error);
  }
  return JSON.parse(await result.text()) as OutputType;
};