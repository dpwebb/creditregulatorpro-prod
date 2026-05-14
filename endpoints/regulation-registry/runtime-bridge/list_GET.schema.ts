import { z } from "zod";
import {
  RegulationRuntimeBridgeActivationStatusArrayValues,
  RegulationRuntimeBridgeConsumerWordingModeArrayValues,
  RegulationRuntimeBridgeModeArrayValues,
  RegulationRuntimeBridgeReferenceClassArrayValues,
} from "../../../helpers/schema";

export const RUNTIME_BRIDGE_MAPPING_DEFAULT_LIMIT = 100;
export const RUNTIME_BRIDGE_MAPPING_MAX_LIMIT = 300;

export const schema = z.object({
  bridgeMode: z.enum(RegulationRuntimeBridgeModeArrayValues).optional(),
  activationStatus: z.enum(RegulationRuntimeBridgeActivationStatusArrayValues).optional(),
  deterministicRuleId: z.string().trim().min(1).optional(),
  violationCategory: z.string().trim().min(1).optional(),
  staticReferenceId: z.string().trim().min(1).optional(),
  dbRegulationId: z.string().trim().min(1).optional(),
  dbMappingId: z.coerce.number().int().positive().optional(),
  referenceClass: z.enum(RegulationRuntimeBridgeReferenceClassArrayValues).optional(),
  consumerWordingMode: z.enum(RegulationRuntimeBridgeConsumerWordingModeArrayValues).optional(),
  includeTestManifest: z.coerce.boolean().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(RUNTIME_BRIDGE_MAPPING_MAX_LIMIT)
    .default(RUNTIME_BRIDGE_MAPPING_DEFAULT_LIMIT),
}).strict();

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  mappings: unknown[];
};

export const getRuntimeBridgeMappings = async (
  filters?: Partial<InputType>,
  init?: RequestInit,
): Promise<OutputType> => {
  const params = new URLSearchParams();
  if (filters?.bridgeMode) params.set("bridgeMode", filters.bridgeMode);
  if (filters?.activationStatus) params.set("activationStatus", filters.activationStatus);
  if (filters?.deterministicRuleId) params.set("deterministicRuleId", filters.deterministicRuleId);
  if (filters?.violationCategory) params.set("violationCategory", filters.violationCategory);
  if (filters?.staticReferenceId) params.set("staticReferenceId", filters.staticReferenceId);
  if (filters?.dbRegulationId) params.set("dbRegulationId", filters.dbRegulationId);
  if (filters?.dbMappingId) params.set("dbMappingId", String(filters.dbMappingId));
  if (filters?.referenceClass) params.set("referenceClass", filters.referenceClass);
  if (filters?.consumerWordingMode) params.set("consumerWordingMode", filters.consumerWordingMode);
  if (filters?.includeTestManifest) params.set("includeTestManifest", "true");
  if (filters?.limit) params.set("limit", String(filters.limit));

  const result = await fetch(
    `/_api/regulation-registry/runtime-bridge/list${params.toString() ? `?${params}` : ""}`,
    {
      method: "GET",
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    },
  );
  if (!result.ok) {
    const errorObject = JSON.parse(await result.text()) as { error: string };
    throw new Error(errorObject.error);
  }
  return JSON.parse(await result.text()) as OutputType;
};
