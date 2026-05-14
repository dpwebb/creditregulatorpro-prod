import type {
  ConsumerWordingMode,
  DbRuntimeMappingSnapshot,
  DbRuntimeReferenceSnapshot,
  ReferenceClass,
  RuntimeSourceUsed,
  StaticRuntimeReferenceMappingSnapshot,
  StaticRuntimeReferenceSnapshot,
} from "./regulationRuntimeBridgeShadow";

export type AdvisoryBridgeActivationStatus =
  | "draft"
  | "approved_for_shadow"
  | "approved_for_advisory"
  | "approved_for_limited_runtime"
  | "active_limited_runtime"
  | "paused"
  | "rolled_back"
  | "rejected"
  | "archived";

export type AdvisoryBridgeMode = "shadow" | "advisory" | "limited_runtime";

export type AdvisoryBridgeMappingSnapshot = {
  id: string | number;
  bridgeMode?: AdvisoryBridgeMode | string | null;
  activationStatus?: AdvisoryBridgeActivationStatus | string | null;
  deterministicRuleId?: string | null;
  violationCategory?: string | null;
  staticReferenceId?: string | null;
  dbRegulationId?: string | null;
  dbMappingId?: string | number | null;
  referenceClass?: ReferenceClass | string | null;
  consumerWordingMode?: ConsumerWordingMode | string | null;
  activationReason?: string | null;
  sourceVersion?: string | null;
};

export type RegulationRuntimeBridgeAdvisoryContext = {
  deterministicRuleId?: string | null;
  violationCategory?: string | null;
  staticReferenceId?: string | null;
  consumerFacing?: boolean;
};

export type AdvisoryReference = {
  displayScope: "admin_internal_only";
  bridgeMappingId: string;
  dbRegulationId: string;
  dbMappingId?: string | null;
  referenceClass: ReferenceClass;
  consumerWordingMode: ConsumerWordingMode;
  citation?: string;
  title?: string;
  sourceUrl?: string | null;
  jurisdiction?: string;
  category?: string;
  sourceVersion?: string | null;
  advisoryReason: string;
};

export type AdvisoryBridgeResult = {
  mode: "advisory";
  runtimeSourceUsed: RuntimeSourceUsed;
  consumerReference: StaticRuntimeReferenceSnapshot | null;
  advisoryReference?: AdvisoryReference;
  warnings: string[];
  fallbackUsed: boolean;
};

export type RegulationRuntimeBridgeAdvisoryInput = {
  staticReferences: StaticRuntimeReferenceSnapshot[];
  staticViolationMappings?: StaticRuntimeReferenceMappingSnapshot[];
  dbRegulations: DbRuntimeReferenceSnapshot[];
  dbMappings?: DbRuntimeMappingSnapshot[];
  bridgeMappings?: AdvisoryBridgeMappingSnapshot[];
  context?: RegulationRuntimeBridgeAdvisoryContext;
};

const FORBIDDEN_ADVISORY_REFERENCE_LANGUAGE = [
  /\bthis is illegal\b/i,
  /\bviolates? the law\b/i,
  /\bthe bureau broke the law\b/i,
  /\bentitled to damages\b/i,
  /\bmust pay\b/i,
  /\bconfirmed violation\b/i,
  /\bconfirmed legal violation\b/i,
  /\benforce\b/i,
  /\bdemand\b/i,
  /\bthreaten(?:ed|ing)?\b/i,
  /\bwe will sue\b/i,
  /\blawsuit\b/i,
] as const;

function cleanString(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeId(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isApproved(value: unknown): boolean {
  return normalizeText(value) === "approved";
}

function isActive(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const normalized = normalizeText(value);
  return normalized === "active" || normalized === "true";
}

function isRepealedOrSuperseded(value: unknown): boolean {
  const normalized = normalizeText(value);
  return normalized.includes("repeal") || normalized.includes("supersed");
}

function sourceUrlOf(reference: DbRuntimeReferenceSnapshot): string | null {
  return (
    cleanString(reference.officialSourceUrl) ??
    cleanString(reference.sourceUrl) ??
    cleanString(reference.sourceDocumentUrl)
  );
}

function titleOf(reference: DbRuntimeReferenceSnapshot): string | null {
  return (
    cleanString(reference.title) ??
    cleanString(reference.regulationTitle) ??
    cleanString(reference.shortTitle)
  );
}

function citationOf(reference: DbRuntimeReferenceSnapshot): string | null {
  return (
    cleanString(reference.citationFormat) ??
    cleanString(reference.citation) ??
    cleanString(reference.sectionNumber)
  );
}

function categoryOf(reference: DbRuntimeReferenceSnapshot): string | null {
  return cleanString(reference.category) ?? cleanString(reference.regulationCategory);
}

function bridgeMappingIdOf(mapping: AdvisoryBridgeMappingSnapshot): string {
  return String(mapping.id);
}

function dbMappingIdOf(mapping: DbRuntimeMappingSnapshot): string | null {
  const value = mapping.mappingId ?? mapping.id;
  return value === null || value === undefined ? null : String(value);
}

function validReferenceClass(value: unknown): value is ReferenceClass {
  return (
    value === "official_law" ||
    value === "regulator_guidance" ||
    value === "private_standard" ||
    value === "local_procedural" ||
    value === "internal_only"
  );
}

function validConsumerWordingMode(value: unknown): value is ConsumerWordingMode {
  return (
    value === "review_reference" ||
    value === "private_standard_reference" ||
    value === "procedural_reference" ||
    value === "internal_only"
  );
}

function wordingCompatible(
  referenceClass: ReferenceClass,
  consumerWordingMode: ConsumerWordingMode,
): boolean {
  if (referenceClass === "private_standard") return consumerWordingMode === "private_standard_reference";
  if (referenceClass === "local_procedural") return consumerWordingMode === "procedural_reference";
  if (referenceClass === "internal_only") return consumerWordingMode === "internal_only";
  return consumerWordingMode === "review_reference";
}

function contextHasSelector(context: RegulationRuntimeBridgeAdvisoryContext | undefined): boolean {
  return Boolean(
    cleanString(context?.deterministicRuleId) ||
      cleanString(context?.violationCategory) ||
      cleanString(context?.staticReferenceId)
  );
}

function bridgeMappingMatchesContext(
  mapping: AdvisoryBridgeMappingSnapshot,
  context: RegulationRuntimeBridgeAdvisoryContext | undefined,
): boolean {
  if (!contextHasSelector(context)) return false;

  if (
    context?.deterministicRuleId &&
    normalizeId(mapping.deterministicRuleId) === normalizeId(context.deterministicRuleId)
  ) {
    return true;
  }
  if (
    context?.violationCategory &&
    normalizeId(mapping.violationCategory) === normalizeId(context.violationCategory)
  ) {
    return true;
  }
  if (
    context?.staticReferenceId &&
    normalizeId(mapping.staticReferenceId) === normalizeId(context.staticReferenceId)
  ) {
    return true;
  }
  return false;
}

function staticMappingMatchesContext(
  mapping: StaticRuntimeReferenceMappingSnapshot,
  context: RegulationRuntimeBridgeAdvisoryContext | undefined,
): boolean {
  if (!contextHasSelector(context)) return false;

  if (
    context?.deterministicRuleId &&
    normalizeId(mapping.deterministicRuleId ?? mapping.ruleId) === normalizeId(context.deterministicRuleId)
  ) {
    return true;
  }
  if (
    context?.violationCategory &&
    normalizeId(mapping.violationCategory) === normalizeId(context.violationCategory)
  ) {
    return true;
  }
  return false;
}

function selectStaticConsumerReference(input: {
  staticReferences: StaticRuntimeReferenceSnapshot[];
  staticViolationMappings: StaticRuntimeReferenceMappingSnapshot[];
  bridgeMappings: AdvisoryBridgeMappingSnapshot[];
  context?: RegulationRuntimeBridgeAdvisoryContext;
}): { reference: StaticRuntimeReferenceSnapshot | null; warnings: string[] } {
  const warnings: string[] = [];
  const staticById = new Map(input.staticReferences.map((reference) => [normalizeId(reference.id), reference]));

  if (input.context?.staticReferenceId) {
    const direct = staticById.get(normalizeId(input.context.staticReferenceId));
    if (direct) return { reference: direct, warnings };
    return { reference: null, warnings: ["static_fallback_missing"] };
  }

  const matchingStaticMappings = input.staticViolationMappings.filter((mapping) =>
    staticMappingMatchesContext(mapping, input.context),
  );
  const matchingStaticReferences = matchingStaticMappings
    .map((mapping) => staticById.get(normalizeId(mapping.regulationId)) ?? null)
    .filter((reference): reference is StaticRuntimeReferenceSnapshot => reference !== null);

  if (matchingStaticReferences.length > 0) {
    if (matchingStaticReferences.length > 1) warnings.push("multiple_static_fallbacks_static_consumer_reference_uses_first");
    return { reference: matchingStaticReferences[0], warnings };
  }

  const matchingBridgeStaticIds = input.bridgeMappings
    .filter((mapping) => bridgeMappingMatchesContext(mapping, input.context))
    .map((mapping) => cleanString(mapping.staticReferenceId))
    .filter((value): value is string => value !== null);
  for (const id of matchingBridgeStaticIds) {
    const reference = staticById.get(normalizeId(id));
    if (reference) return { reference, warnings };
  }

  if (!contextHasSelector(input.context) && input.staticReferences.length === 1) {
    return { reference: input.staticReferences[0], warnings: ["advisory_context_missing"] };
  }

  return { reference: null, warnings: ["static_fallback_missing"] };
}

function dbRegulationWarnings(
  dbReference: DbRuntimeReferenceSnapshot | undefined,
  referenceClass: ReferenceClass,
): string[] {
  const warnings: string[] = [];
  if (!dbReference) return ["db_record_missing"];

  if (!isApproved(dbReference.reviewStatus)) warnings.push("db_record_unapproved");
  if (!isActive(dbReference.activeStatus)) warnings.push("db_record_inactive");
  if (isRepealedOrSuperseded(dbReference.repealOrSupersededStatus ?? dbReference.repealSupersededStatus)) {
    warnings.push("db_record_superseded_or_repealed");
  }
  if (!cleanString(dbReference.jurisdiction)) warnings.push("db_record_missing_jurisdiction");
  if (!categoryOf(dbReference)) warnings.push("db_record_missing_category");
  if (!titleOf(dbReference)) warnings.push("db_record_missing_title");
  if (!citationOf(dbReference)) warnings.push("db_record_missing_citation");
  if (
    (referenceClass === "official_law" || referenceClass === "regulator_guidance") &&
    !sourceUrlOf(dbReference)
  ) {
    warnings.push("db_record_missing_source_url");
  }
  return warnings;
}

function dbMappingWarnings(input: {
  bridgeMapping: AdvisoryBridgeMappingSnapshot;
  dbMappingById: Map<string, DbRuntimeMappingSnapshot>;
}): string[] {
  const dbMappingId = cleanString(input.bridgeMapping.dbMappingId);
  if (!dbMappingId) return [];

  const dbMapping = input.dbMappingById.get(normalizeId(dbMappingId));
  if (!dbMapping) return ["db_mapping_missing"];

  const warnings: string[] = [];
  if (!isApproved(dbMapping.reviewStatus)) warnings.push("db_mapping_unapproved");
  if (!isActive(dbMapping.activeStatus ?? dbMapping.active)) warnings.push("db_mapping_inactive");
  if (
    cleanString(input.bridgeMapping.dbRegulationId) &&
    normalizeId(dbMapping.regulationId) !== normalizeId(input.bridgeMapping.dbRegulationId)
  ) {
    warnings.push("db_mapping_regulation_mismatch");
  }
  return warnings;
}

function advisoryCandidateWarnings(input: {
  bridgeMapping: AdvisoryBridgeMappingSnapshot;
  dbReference?: DbRuntimeReferenceSnapshot;
  dbMappingById: Map<string, DbRuntimeMappingSnapshot>;
  consumerFacing: boolean;
}): string[] {
  const warnings: string[] = [];

  if (!validReferenceClass(input.bridgeMapping.referenceClass)) {
    warnings.push("bridge_mapping_missing_reference_class");
  }
  if (!validConsumerWordingMode(input.bridgeMapping.consumerWordingMode)) {
    warnings.push("bridge_mapping_missing_consumer_wording_mode");
  }
  if (!cleanString(input.bridgeMapping.dbRegulationId)) {
    warnings.push("bridge_mapping_missing_db_regulation_id");
  }

  if (
    validReferenceClass(input.bridgeMapping.referenceClass) &&
    validConsumerWordingMode(input.bridgeMapping.consumerWordingMode)
  ) {
    if (!wordingCompatible(input.bridgeMapping.referenceClass, input.bridgeMapping.consumerWordingMode)) {
      warnings.push("bridge_mapping_reference_wording_incompatible");
    }
    if (
      input.consumerFacing &&
      (input.bridgeMapping.referenceClass === "internal_only" ||
        input.bridgeMapping.consumerWordingMode === "internal_only")
    ) {
      warnings.push("internal_only_not_consumer_facing");
    }
    warnings.push(...dbRegulationWarnings(input.dbReference, input.bridgeMapping.referenceClass));
  }

  warnings.push(...dbMappingWarnings({
    bridgeMapping: input.bridgeMapping,
    dbMappingById: input.dbMappingById,
  }));

  return [...new Set(warnings)];
}

function buildStaticResult(
  consumerReference: StaticRuntimeReferenceSnapshot | null,
  warnings: string[],
): AdvisoryBridgeResult {
  return {
    mode: "advisory",
    runtimeSourceUsed: "static_runtime",
    consumerReference,
    warnings: [...new Set(warnings)],
    fallbackUsed: true,
  };
}

export function containsForbiddenAdvisoryReferenceLanguage(value: string | null | undefined): boolean {
  const text = cleanString(value);
  if (!text) return false;
  return FORBIDDEN_ADVISORY_REFERENCE_LANGUAGE.some((pattern) => pattern.test(text));
}

export function buildAdvisoryBridgeReferenceLabel(input: {
  referenceClass: ReferenceClass;
}): string {
  if (input.referenceClass === "official_law") {
    return "This DB reference may be relevant for admin review.";
  }
  if (input.referenceClass === "regulator_guidance") {
    return "This DB guidance source may be relevant for admin review.";
  }
  if (input.referenceClass === "private_standard") {
    return "This private or industry standard may be relevant for admin review; it is not presented as law.";
  }
  if (input.referenceClass === "local_procedural") {
    return "This procedural reference may be relevant for admin review.";
  }
  return "Internal reference only. Not consumer-facing.";
}

export function buildRegulationRuntimeBridgeAdvisoryResult(
  input: RegulationRuntimeBridgeAdvisoryInput,
): AdvisoryBridgeResult {
  const staticReferences = [...input.staticReferences];
  const staticViolationMappings = [...(input.staticViolationMappings ?? [])];
  const dbRegulations = [...input.dbRegulations];
  const dbMappings = [...(input.dbMappings ?? [])];
  const bridgeMappings = [...(input.bridgeMappings ?? [])];
  const warnings: string[] = [];
  const consumerFacing = input.context?.consumerFacing ?? true;

  const staticSelection = selectStaticConsumerReference({
    staticReferences,
    staticViolationMappings,
    bridgeMappings,
    context: input.context,
  });
  warnings.push(...staticSelection.warnings);

  if (!contextHasSelector(input.context)) {
    warnings.push("advisory_context_missing");
  }
  if (!staticSelection.reference) {
    return buildStaticResult(staticSelection.reference, warnings);
  }

  const matchingBridgeMappings = bridgeMappings.filter((mapping) =>
    bridgeMappingMatchesContext(mapping, input.context),
  );
  const nonAdvisoryMatches = matchingBridgeMappings.filter((mapping) =>
    mapping.activationStatus !== "approved_for_advisory" || mapping.bridgeMode !== "advisory",
  );
  for (const mapping of nonAdvisoryMatches) {
    warnings.push(
      `bridge_mapping_not_advisory_eligible:${cleanString(mapping.activationStatus) ?? "missing_status"}`,
    );
  }

  const advisoryCandidates = matchingBridgeMappings.filter((mapping) =>
    mapping.activationStatus === "approved_for_advisory" && mapping.bridgeMode === "advisory",
  );

  if (advisoryCandidates.length === 0) {
    warnings.push("no_approved_advisory_bridge_mapping");
    return buildStaticResult(staticSelection.reference, warnings);
  }

  if (advisoryCandidates.length > 1) {
    warnings.push("ambiguous_advisory_bridge_mapping");
    return buildStaticResult(staticSelection.reference, warnings);
  }

  const bridgeMapping = advisoryCandidates[0];
  const dbById = new Map(dbRegulations.map((reference) => [normalizeId(reference.regulationId), reference]));
  const dbMappingById = new Map(
    dbMappings
      .map((mapping) => {
        const id = dbMappingIdOf(mapping);
        return id ? [normalizeId(id), mapping] as const : null;
      })
      .filter((entry): entry is readonly [string, DbRuntimeMappingSnapshot] => entry !== null),
  );
  const dbReference = dbById.get(normalizeId(bridgeMapping.dbRegulationId));
  const candidateWarnings = advisoryCandidateWarnings({
    bridgeMapping,
    dbReference,
    dbMappingById,
    consumerFacing,
  });

  if (candidateWarnings.length > 0 || !dbReference) {
    return buildStaticResult(staticSelection.reference, [...warnings, ...candidateWarnings]);
  }

  if (
    !validReferenceClass(bridgeMapping.referenceClass) ||
    !validConsumerWordingMode(bridgeMapping.consumerWordingMode)
  ) {
    return buildStaticResult(staticSelection.reference, [
      ...warnings,
      "bridge_mapping_reference_metadata_invalid",
    ]);
  }

  const title = titleOf(dbReference);
  const citation = citationOf(dbReference);
  const jurisdiction = cleanString(dbReference.jurisdiction);
  const category = categoryOf(dbReference);
  if (!title || !citation || !jurisdiction || !category) {
    return buildStaticResult(staticSelection.reference, [
      ...warnings,
      "db_reference_missing_required_display_metadata",
    ]);
  }

  return {
    mode: "advisory",
    runtimeSourceUsed: "static_runtime",
    consumerReference: staticSelection.reference,
    advisoryReference: {
      displayScope: "admin_internal_only",
      bridgeMappingId: bridgeMappingIdOf(bridgeMapping),
      dbRegulationId: dbReference.regulationId,
      dbMappingId: cleanString(bridgeMapping.dbMappingId),
      referenceClass: bridgeMapping.referenceClass,
      consumerWordingMode: bridgeMapping.consumerWordingMode,
      citation,
      title,
      sourceUrl: sourceUrlOf(dbReference),
      jurisdiction,
      category,
      sourceVersion: cleanString(bridgeMapping.sourceVersion),
      advisoryReason: buildAdvisoryBridgeReferenceLabel({ referenceClass: bridgeMapping.referenceClass }),
    },
    warnings: [...new Set(warnings)],
    fallbackUsed: false,
  };
}
