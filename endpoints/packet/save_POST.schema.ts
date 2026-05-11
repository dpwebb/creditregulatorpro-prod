import { z } from "zod";
import { schema as createPacketSchema, type OutputType as CreatePacketOutput } from "./create_POST.schema";

export const schema = createPacketSchema;

export type InputType = z.infer<typeof schema>;

export type OutputType = CreatePacketOutput;

export const postPacketSave = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch("/_api/packet/save", {
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
