import { z } from "zod";

export const schema = z.object({});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  error: string;
};

export const postSelect = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/planner/select`, {
    method: "POST",
    body: JSON.stringify(schema.parse(body)),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = JSON.parse(await result.text()) as OutputType;
  if (!result.ok) {
    throw new Error(payload.error);
  }

  return payload;
};
