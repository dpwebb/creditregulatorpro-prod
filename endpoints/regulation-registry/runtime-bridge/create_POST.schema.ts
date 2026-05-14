import { z } from "zod";
import {
  RegulationRuntimeBridgeConsumerWordingModeArrayValues,
  RegulationRuntimeBridgeModeArrayValues,
  RegulationRuntimeBridgeReferenceClassArrayValues,
} from "../../../helpers/schema";

export const schema = z.object({
  bridgeMode: z.enum(RegulationRuntimeBridgeModeArrayValues),
  deterministicRuleId: z.string().trim().min(1).nullable().optional(),
  violationCategory: z.string().trim().min(1).nullable().optional(),
  staticReferenceId: z.string().trim().min(1).nullable().optional(),
  dbRegulationId: z.string().trim().min(1),
  dbMappingId: z.coerce.number().int().positive().nullable().optional(),
  referenceClass: z.enum(RegulationRuntimeBridgeReferenceClassArrayValues),
  consumerWordingMode: z.enum(RegulationRuntimeBridgeConsumerWordingModeArrayValues),
  rollbackStaticReferenceId: z.string().trim().min(1).nullable().optional(),
  activationReason: z.string().trim().nullable().optional(),
  testManifest: z.unknown().nullable().optional(),
  sourceVersion: z.string().trim().min(1).nullable().optional(),
  staticSnapshotHash: z.string().trim().min(1).nullable().optional(),
  dbSnapshotHash: z.string().trim().min(1).nullable().optional(),
}).strict();

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  mapping: unknown;
};

export const postRuntimeBridgeMappingCreate = async (
  body: InputType,
  init?: RequestInit,
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch("/_api/regulation-registry/runtime-bridge/create", {
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
