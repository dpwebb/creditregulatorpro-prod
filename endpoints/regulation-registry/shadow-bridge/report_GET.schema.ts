import { z } from "zod";
import type {
  ConsumerWordingMode,
  IgnoredDbReferenceReason,
  ReferenceClass,
  RegulationRuntimeBridgeShadowFinding,
  ShadowMismatchType,
} from "../../../helpers/regulationRuntimeBridgeShadow";

export const SHADOW_BRIDGE_REPORT_DEFAULT_LIMIT = 100;
export const SHADOW_BRIDGE_REPORT_MAX_LIMIT = 300;

export const ShadowBridgeReferenceClassArrayValues = [
  "official_law",
  "regulator_guidance",
  "private_standard",
  "local_procedural",
  "internal_only",
] as const;

export const ShadowBridgeConsumerWordingModeArrayValues = [
  "review_reference",
  "private_standard_reference",
  "procedural_reference",
  "internal_only",
] as const;

export const ShadowBridgeFindingTypeArrayValues = [
  "shadow_alternative",
  "ignored_db_reference",
  "db_alternative_matches_static",
  "db_alternative_differs_from_static",
  "db_alternative_missing_static_reference",
  "db_record_missing",
  "db_record_unapproved",
  "db_record_inactive",
  "db_record_superseded_or_repealed",
  "db_record_missing_jurisdiction",
  "db_record_missing_category",
  "db_record_missing_title",
  "db_record_missing_citation",
  "db_record_missing_source_url",
  "mapping_unapproved",
  "mapping_inactive",
  "mapping_unclear",
  "internal_only_consumer_context",
  "shadow_mode_only",
  "static_fallback_missing",
  "reference_mismatch",
  "consumer_wording_unsafe",
  "missing_effective_date",
  "missing_update_version",
] as const;

export const SHADOW_BRIDGE_SAFETY_MESSAGES = [
  "This is a shadow diagnostic only.",
  "Static runtime references remain active.",
  "DB references shown here do not change consumer output.",
  "Runtime activation requires a separate approved bridge implementation.",
] as const;

export const schema = z.object({
  deterministicRuleId: z.string().trim().min(1).optional(),
  violationCategory: z.string().trim().min(1).optional(),
  staticReferenceId: z.string().trim().min(1).optional(),
  dbRegulationId: z.string().trim().min(1).optional(),
  findingType: z.enum(ShadowBridgeFindingTypeArrayValues).optional(),
  referenceClass: z.enum(ShadowBridgeReferenceClassArrayValues).optional(),
  consumerWordingMode: z.enum(ShadowBridgeConsumerWordingModeArrayValues).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(SHADOW_BRIDGE_REPORT_MAX_LIMIT)
    .default(SHADOW_BRIDGE_REPORT_DEFAULT_LIMIT),
});

export type InputType = z.infer<typeof schema>;

export type ShadowBridgeDiagnosticFinding = RegulationRuntimeBridgeShadowFinding & {
  bridgeMode: "shadow";
  runtimeSourceUsed: "static_runtime";
  staticRuntimeReferenceStatus: "active_static_runtime";
  dbReferenceStatus: "shadow_only";
  safetyWarnings: string[];
};

export type ShadowBridgeDiagnosticIgnoredDbReference = {
  bridgeMode: "shadow";
  runtimeSourceUsed: "static_runtime";
  dbReferenceStatus: "ignored";
  dbRegulationId: string;
  dbMappingId?: string | null;
  deterministicRuleId?: string | null;
  violationCategory?: string | null;
  referenceClass: ReferenceClass;
  consumerWordingMode: ConsumerWordingMode;
  reasons: IgnoredDbReferenceReason[];
  limitedRuntimeUnsafe: true;
  safetyWarnings: string[];
};

export type OutputType = {
  bridgeMode: "shadow";
  runtimeSourceUsed: "static_runtime";
  generatedAt: string;
  filters: InputType;
  summary: {
    totalStaticReferences: number;
    totalDbRecordsConsidered: number;
    totalShadowAlternatives: number;
    totalIgnoredDbReferences: number;
    totalWarnings: number;
  };
  findings: ShadowBridgeDiagnosticFinding[];
  ignoredDbReferences: ShadowBridgeDiagnosticIgnoredDbReference[];
  safetyMessages: string[];
};

export const getRegulationShadowBridgeReport = async (
  filters?: Partial<InputType>,
  init?: RequestInit,
): Promise<OutputType> => {
  const params = new URLSearchParams();
  if (filters?.deterministicRuleId) params.set("deterministicRuleId", filters.deterministicRuleId);
  if (filters?.violationCategory) params.set("violationCategory", filters.violationCategory);
  if (filters?.staticReferenceId) params.set("staticReferenceId", filters.staticReferenceId);
  if (filters?.dbRegulationId) params.set("dbRegulationId", filters.dbRegulationId);
  if (filters?.findingType) params.set("findingType", filters.findingType);
  if (filters?.referenceClass) params.set("referenceClass", filters.referenceClass);
  if (filters?.consumerWordingMode) params.set("consumerWordingMode", filters.consumerWordingMode);
  if (filters?.limit) params.set("limit", String(filters.limit));

  const result = await fetch(
    `/_api/regulation-registry/shadow-bridge/report${params.toString() ? `?${params}` : ""}`,
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
