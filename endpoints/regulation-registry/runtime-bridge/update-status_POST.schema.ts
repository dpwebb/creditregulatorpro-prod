import { z } from "zod";
import { RegulationRuntimeBridgeActivationStatusArrayValues } from "../../../helpers/schema";

export const schema = z.object({
  mappingId: z.coerce.number().int().positive(),
  activationStatus: z.enum(RegulationRuntimeBridgeActivationStatusArrayValues),
  activationReason: z.string().trim().nullable().optional(),
  rollbackStaticReferenceId: z.string().trim().min(1).nullable().optional(),
  testManifest: z.unknown().nullable().optional(),
}).strict();

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  mapping: unknown;
};

export const postRuntimeBridgeMappingStatus = async (
  body: InputType,
  init?: RequestInit,
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch("/_api/regulation-registry/runtime-bridge/update-status", {
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
