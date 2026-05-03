import { z } from "zod";
import { readStatuteRequestError } from "./requestError";

export const schema = z.object({
  versionId: z.number(), // statute_version.id to delete
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  success: boolean;
};

export const postStatuteDelete = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/statute/delete`, {
    method: "POST",
    body: JSON.stringify(validatedInput),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!result.ok) {
    throw new Error(await readStatuteRequestError(result));
  }
  return JSON.parse(await result.text());
};
