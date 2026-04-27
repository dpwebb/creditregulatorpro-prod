import { z } from "zod";

import { Selectable } from "kysely";
import { IdentityTheftFreeze, FreezeType } from "../../helpers/schema";

// Define Json type for zod since schema uses Json
const literalSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
type Literal = z.infer<typeof literalSchema>;
type Json = Literal | { [key: string]: Json } | Json[];
const jsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([literalSchema, z.array(jsonSchema), z.record(jsonSchema)])
);

export const schema = z.object({
  bureauId: z.number(),
  freezeType: z.enum(["fraud_alert", "extended_fraud_alert", "security_freeze"]),
  notes: z.string().optional().nullable(),
  verificationDocuments: jsonSchema.optional().nullable(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  freeze: Selectable<IdentityTheftFreeze>;
};

export const postCreateFreeze = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/fraud-freeze/create`, {
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