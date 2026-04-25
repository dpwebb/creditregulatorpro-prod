import { z } from "zod";
import { Selectable } from "kysely";
import { RegulatoryUpdateLog } from "../../helpers/schema";

export const schema = z.object({
  id: z.number(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  update: Selectable<RegulatoryUpdateLog>;
};

export const postRegulatoryUpdateRollback = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/regulatory-update/rollback`, {
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