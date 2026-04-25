import { z } from "zod";


export const schema = z.object({
  tradelineId: z.number(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  ok: boolean;
  violationsFound: number;
  message: string;
};

export const postRescanCompliance = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/tradeline/rescan-compliance`, {
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
    throw new Error(errorObject.error);
  }

  return JSON.parse(await result.text());
};