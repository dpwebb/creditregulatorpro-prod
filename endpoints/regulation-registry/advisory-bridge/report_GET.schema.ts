import { z } from "zod";
import type {
  AdvisoryReference,
  AdvisoryBridgeResult,
} from "../../../helpers/regulationRuntimeBridgeAdvisory";
import type {
  ConsumerWordingMode,
  ReferenceClass,
  StaticRuntimeReferenceSnapshot,
} from "../../../helpers/regulationRuntimeBridgeShadow";
import {
  RegulationRuntimeBridgeActivationStatusArrayValues,
  RegulationRuntimeBridgeConsumerWordingModeArrayValues,
  RegulationRuntimeBridgeModeArrayValues,
  RegulationRuntimeBridgeReferenceClassArrayValues,
  type RegulationRuntimeBridgeActivationStatus,
  type RegulationRuntimeBridgeMode,
} from "../../../helpers/schema";

export const ADVISORY_BRIDGE_REPORT_DEFAULT_LIMIT = 100;
export const ADVISORY_BRIDGE_REPORT_MAX_LIMIT = 300;

export const ADVISORY_BRIDGE_SAFETY_MESSAGES = [
  "This is an advisory diagnostic only.",
  "Static runtime references remain active consumer-facing truth.",
  "DB advisory references are admin/internal only.",
  "This endpoint does not change packet wording, packet readiness, or violation firing.",
  "Runtime activation requires a separate approved implementation, tests, rollback plan, and explicit activation task.",
] as const;

export const schema = z.object({
  deterministicRuleId: z.string().trim().min(1).optional(),
  violationCategory: z.string().trim().min(1).optional(),
  staticReferenceId: z.string().trim().min(1).optional(),
  dbRegulationId: z.string().trim().min(1).optional(),
  dbMappingId: z.coerce.number().int().positive().optional(),
  bridgeMappingId: z.coerce.number().int().positive().optional(),
  referenceClass: z.enum(RegulationRuntimeBridgeReferenceClassArrayValues).optional(),
  consumerWordingMode: z.enum(RegulationRuntimeBridgeConsumerWordingModeArrayValues).optional(),
  activationStatus: z.enum(RegulationRuntimeBridgeActivationStatusArrayValues).optional(),
  bridgeMode: z.enum(RegulationRuntimeBridgeModeArrayValues).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(ADVISORY_BRIDGE_REPORT_MAX_LIMIT)
    .default(ADVISORY_BRIDGE_REPORT_DEFAULT_LIMIT),
}).strict();

export type InputType = z.infer<typeof schema>;

export type AdvisoryBridgeDiagnosticResult = AdvisoryBridgeResult & {
  bridgeMappingId: string;
  bridgeMode: RegulationRuntimeBridgeMode | string | null;
  activationStatus: RegulationRuntimeBridgeActivationStatus | string | null;
  deterministicRuleId: string | null;
  violationCategory: string | null;
  staticReferenceId: string | null;
  dbRegulationId: string | null;
  dbMappingId: string | null;
  referenceClass: ReferenceClass | string | null;
  consumerWordingMode: ConsumerWordingMode | string | null;
  consumerReference: StaticRuntimeReferenceSnapshot | null;
  advisoryReference?: AdvisoryReference;
  runtimeSourceUsed: "static_runtime";
  safetyWarnings: string[];
};

export type AdvisoryBridgeDiagnosticIgnoredMapping = {
  bridgeMappingId: string;
  bridgeMode: RegulationRuntimeBridgeMode | string | null;
  activationStatus: RegulationRuntimeBridgeActivationStatus | string | null;
  deterministicRuleId: string | null;
  violationCategory: string | null;
  staticReferenceId: string | null;
  dbRegulationId: string | null;
  dbMappingId: string | null;
  referenceClass: ReferenceClass | string | null;
  consumerWordingMode: ConsumerWordingMode | string | null;
  runtimeSourceUsed: "static_runtime";
  dbReferenceStatus: "ignored";
  reasons: string[];
  safetyWarnings: string[];
};

export type OutputType = {
  mode: "advisory";
  runtimeSourceUsed: "static_runtime";
  generatedAt: string;
  filters: InputType;
  summary: {
    totalBridgeMappingsConsidered: number;
    totalAdvisoryEligible: number;
    totalAdvisoryReferences: number;
    totalFallbackOnly: number;
    totalIgnoredMappings: number;
    totalWarnings: number;
  };
  results: AdvisoryBridgeDiagnosticResult[];
  ignoredMappings: AdvisoryBridgeDiagnosticIgnoredMapping[];
  safetyMessages: string[];
};

export const getRegulationAdvisoryBridgeReport = async (
  filters?: Partial<InputType>,
  init?: RequestInit,
): Promise<OutputType> => {
  const params = new URLSearchParams();
  if (filters?.deterministicRuleId) params.set("deterministicRuleId", filters.deterministicRuleId);
  if (filters?.violationCategory) params.set("violationCategory", filters.violationCategory);
  if (filters?.staticReferenceId) params.set("staticReferenceId", filters.staticReferenceId);
  if (filters?.dbRegulationId) params.set("dbRegulationId", filters.dbRegulationId);
  if (filters?.dbMappingId) params.set("dbMappingId", String(filters.dbMappingId));
  if (filters?.bridgeMappingId) params.set("bridgeMappingId", String(filters.bridgeMappingId));
  if (filters?.referenceClass) params.set("referenceClass", filters.referenceClass);
  if (filters?.consumerWordingMode) params.set("consumerWordingMode", filters.consumerWordingMode);
  if (filters?.activationStatus) params.set("activationStatus", filters.activationStatus);
  if (filters?.bridgeMode) params.set("bridgeMode", filters.bridgeMode);
  if (filters?.limit) params.set("limit", String(filters.limit));

  const result = await fetch(
    `/_api/regulation-registry/advisory-bridge/report${params.toString() ? `?${params}` : ""}`,
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
