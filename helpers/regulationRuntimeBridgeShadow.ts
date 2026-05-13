export type BridgeMode = "off" | "shadow";

export type RuntimeSourceUsed = "static_runtime";

export type ReferenceClass =
  | "official_law"
  | "regulator_guidance"
  | "private_standard"
  | "local_procedural"
  | "internal_only";

export type ConsumerWordingMode =
  | "review_reference"
  | "private_standard_reference"
  | "procedural_reference"
  | "internal_only";

export type StaticRuntimeReferenceSnapshot = {
  id: string;
  title?: string | null;
  citation?: string | null;
  shortLabel?: string | null;
  jurisdiction?: string | null;
  category?: string | null;
  sourceUrl?: string | null;
  authorityType?: string | null;
  sourceQuality?: string | null;
  supportLevel?: string | null;
};

export type StaticRuntimeReferenceMappingSnapshot = {
  regulationId: string;
  violationCategory?: string | null;
  deterministicRuleId?: string | null;
  ruleId?: string | null;
};

export type DbRuntimeReferenceSnapshot = {
  regulationId: string;
  title?: string | null;
  regulationTitle?: string | null;
  shortTitle?: string | null;
  citationFormat?: string | null;
  citation?: string | null;
  sectionNumber?: string | null;
  jurisdiction?: string | null;
  category?: string | null;
  regulationCategory?: string | null;
  officialSourceUrl?: string | null;
  sourceUrl?: string | null;
  sourceDocumentUrl?: string | null;
  effectiveDate?: string | Date | null;
  updateVersion?: string | number | null;
  reviewStatus?: string | null;
  activeStatus?: string | null;
  repealOrSupersededStatus?: string | null;
  repealSupersededStatus?: string | null;
  sourceHash?: string | null;
  sourceContentHash?: string | null;
  referenceType?: string | null;
  authoritySource?: string | null;
  sourceQuality?: string | null;
  supportLevel?: string | null;
};

export type DbRuntimeMappingSnapshot = {
  mappingId?: string | number | null;
  id?: string | number | null;
  regulationId: string;
  violationCategory?: string | null;
  deterministicRuleId?: string | null;
  ruleId?: string | null;
  reviewStatus?: string | null;
  activeStatus?: string | boolean | null;
  active?: boolean | null;
  referenceClass?: ReferenceClass | null;
  consumerWordingMode?: ConsumerWordingMode | null;
  explanationTemplate?: string | null;
};

export type RegulationRuntimeBridgeShadowContext = {
  deterministicRuleId?: string | null;
  violationCategory?: string | null;
  consumerFacing?: boolean;
};

export type ShadowMismatchType =
  | "db_alternative_matches_static"
  | "db_alternative_differs_from_static"
  | "db_alternative_missing_static_reference";

export type IgnoredDbReferenceReason =
  | "db_record_missing"
  | "db_record_unapproved"
  | "db_record_inactive"
  | "db_record_superseded_or_repealed"
  | "db_record_missing_jurisdiction"
  | "db_record_missing_category"
  | "db_record_missing_title"
  | "db_record_missing_citation"
  | "db_record_missing_source_url"
  | "mapping_unapproved"
  | "mapping_inactive"
  | "mapping_unclear"
  | "internal_only_consumer_context";

export type LimitedRuntimeUnsafeReason =
  | "shadow_mode_only"
  | "static_fallback_missing"
  | "reference_mismatch"
  | "consumer_wording_unsafe"
  | "missing_effective_date"
  | "missing_update_version"
  | IgnoredDbReferenceReason;

export type StaticActiveReferenceResult = {
  runtimeSourceUsed: RuntimeSourceUsed;
  references: StaticRuntimeReferenceSnapshot[];
};

export type ShadowDbReferenceCandidate = {
  dbRegulationId: string;
  dbMappingId?: string | null;
  title: string;
  citation: string;
  jurisdiction: string;
  category: string;
  sourceUrl: string | null;
  effectiveDate: string | null;
  updateVersion: string | null;
  referenceClass: ReferenceClass;
  consumerWordingMode: ConsumerWordingMode;
};

export type RegulationRuntimeBridgeShadowFinding = {
  staticReferenceId?: string | null;
  dbRegulationId: string;
  dbMappingId?: string | null;
  deterministicRuleId?: string | null;
  violationCategory?: string | null;
  mismatchType: ShadowMismatchType;
  referenceClass: ReferenceClass;
  consumerWordingMode: ConsumerWordingMode;
  staticReference?: StaticRuntimeReferenceSnapshot | null;
  dbReferenceCandidate: ShadowDbReferenceCandidate;
  reason: string;
  limitedRuntimeUnsafe: boolean;
  limitedRuntimeUnsafeReasons: LimitedRuntimeUnsafeReason[];
  consumerFacingAllowed: boolean;
};

export type IgnoredDbReference = {
  dbRegulationId: string;
  dbMappingId?: string | null;
  deterministicRuleId?: string | null;
  violationCategory?: string | null;
  referenceClass: ReferenceClass;
  consumerWordingMode: ConsumerWordingMode;
  reasons: IgnoredDbReferenceReason[];
  limitedRuntimeUnsafe: true;
};

export type RegulationRuntimeBridgeShadowReport = {
  bridgeMode: "shadow";
  runtimeSourceUsed: RuntimeSourceUsed;
  activeReferenceResult: StaticActiveReferenceResult;
  shadowFindings: RegulationRuntimeBridgeShadowFinding[];
  ignoredDbReferences: IgnoredDbReference[];
};

export type RegulationRuntimeBridgeShadowInput = {
  staticReferences: StaticRuntimeReferenceSnapshot[];
  staticViolationMappings?: StaticRuntimeReferenceMappingSnapshot[];
  dbRegulations: DbRuntimeReferenceSnapshot[];
  dbMappings?: DbRuntimeMappingSnapshot[];
  context?: RegulationRuntimeBridgeShadowContext;
};

const FORBIDDEN_CONSUMER_REFERENCE_LANGUAGE = [
  /\bthis is illegal\b/i,
  /\bviolates? the law\b/i,
  /\bthe bureau broke the law\b/i,
  /\bentitled to damages\b/i,
  /\bmust pay\b/i,
  /\bwe will sue\b/i,
  /\blawsuit\b/i,
  /\blegal action will be taken\b/i,
  /\bthreaten(?:ed|ing)?\b/i,
  /\bconfirmed legal violation\b/i,
  /\bconclusive legal\b/i,
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

function dateToString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  return cleanString(value);
}

function mappingIdOf(mapping: DbRuntimeMappingSnapshot): string | null {
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

function inferReferenceClass(
  mapping: DbRuntimeMappingSnapshot,
  reference?: DbRuntimeReferenceSnapshot | null,
): ReferenceClass {
  if (validReferenceClass(mapping.referenceClass)) return mapping.referenceClass;

  const combined = normalizeText([
    reference?.referenceType,
    reference?.sourceQuality,
    reference?.supportLevel,
    reference?.category,
    reference?.regulationCategory,
    reference?.authoritySource,
  ].filter(Boolean).join(" "));

  if (combined.includes("internal")) return "internal_only";
  if (combined.includes("private") || combined.includes("reporting standard") || combined.includes("metro2")) {
    return "private_standard";
  }
  if (combined.includes("procedural") || combined.includes("local")) return "local_procedural";
  if (combined.includes("guidance") || combined.includes("regulator")) return "regulator_guidance";
  return "official_law";
}

function inferConsumerWordingMode(
  mapping: DbRuntimeMappingSnapshot,
  referenceClass: ReferenceClass,
): ConsumerWordingMode {
  if (validConsumerWordingMode(mapping.consumerWordingMode)) return mapping.consumerWordingMode;
  if (referenceClass === "private_standard") return "private_standard_reference";
  if (referenceClass === "local_procedural") return "procedural_reference";
  if (referenceClass === "internal_only") return "internal_only";
  return "review_reference";
}

function mappingMatchesContext(
  mapping: DbRuntimeMappingSnapshot,
  context: RegulationRuntimeBridgeShadowContext | undefined,
): boolean {
  if (!mappingHasRuntimeLink(mapping)) return true;
  if (!context?.deterministicRuleId && !context?.violationCategory) return true;

  const ruleId = normalizeId(mapping.deterministicRuleId ?? mapping.ruleId);
  const category = normalizeId(mapping.violationCategory);

  if (context.deterministicRuleId && ruleId === normalizeId(context.deterministicRuleId)) return true;
  if (context.violationCategory && category === normalizeId(context.violationCategory)) return true;
  return false;
}

function mappingHasRuntimeLink(mapping: DbRuntimeMappingSnapshot): boolean {
  return Boolean(cleanString(mapping.deterministicRuleId ?? mapping.ruleId) || cleanString(mapping.violationCategory));
}

function staticMappingMatchesContext(
  mapping: StaticRuntimeReferenceMappingSnapshot,
  context: RegulationRuntimeBridgeShadowContext | undefined,
): boolean {
  if (!context?.deterministicRuleId && !context?.violationCategory) return true;

  const ruleId = normalizeId(mapping.deterministicRuleId ?? mapping.ruleId);
  const category = normalizeId(mapping.violationCategory);

  if (context.deterministicRuleId && ruleId === normalizeId(context.deterministicRuleId)) return true;
  if (context.violationCategory && category === normalizeId(context.violationCategory)) return true;
  return false;
}

function activeStaticReferencesForInput(
  input: RegulationRuntimeBridgeShadowInput,
): StaticRuntimeReferenceSnapshot[] {
  const staticById = new Map(input.staticReferences.map((reference) => [normalizeId(reference.id), reference]));
  const matchingMappings = (input.staticViolationMappings ?? []).filter((mapping) =>
    staticMappingMatchesContext(mapping, input.context),
  );

  if (matchingMappings.length === 0) return [...input.staticReferences];

  const ids = new Set(matchingMappings.map((mapping) => normalizeId(mapping.regulationId)));
  return input.staticReferences.filter((reference) => ids.has(normalizeId(reference.id)));
}

function staticReferenceForDbAlternative(
  mapping: DbRuntimeMappingSnapshot,
  staticReferences: StaticRuntimeReferenceSnapshot[],
  staticMappings: StaticRuntimeReferenceMappingSnapshot[],
  context: RegulationRuntimeBridgeShadowContext | undefined,
): StaticRuntimeReferenceSnapshot | null {
  const staticById = new Map(staticReferences.map((reference) => [normalizeId(reference.id), reference]));
  const direct = staticById.get(normalizeId(mapping.regulationId));
  if (direct) return direct;

  const staticMapping = staticMappings.find((candidate) => staticMappingMatchesContext(candidate, context));
  return staticMapping ? staticById.get(normalizeId(staticMapping.regulationId)) ?? null : null;
}

function staticTitle(reference: StaticRuntimeReferenceSnapshot): string | null {
  return cleanString(reference.title) ?? cleanString(reference.shortLabel);
}

function referencesDiffer(
  staticReference: StaticRuntimeReferenceSnapshot | null,
  dbReference: ShadowDbReferenceCandidate,
): boolean {
  if (!staticReference) return true;

  const checks = [
    [staticTitle(staticReference), dbReference.title],
    [staticReference.citation, dbReference.citation],
    [staticReference.jurisdiction, dbReference.jurisdiction],
    [staticReference.category, dbReference.category],
  ] as const;

  return checks.some(([left, right]) => cleanString(left) && cleanString(right) && normalizeText(left) !== normalizeText(right));
}

function consumerFacingAllowed(
  referenceClass: ReferenceClass,
  consumerWordingMode: ConsumerWordingMode,
): boolean {
  if (referenceClass === "internal_only" || consumerWordingMode === "internal_only") return false;
  if (referenceClass === "private_standard") return consumerWordingMode === "private_standard_reference";
  if (referenceClass === "local_procedural") return consumerWordingMode === "procedural_reference";
  return consumerWordingMode === "review_reference";
}

function evaluateIgnoredReasons(input: {
  mapping: DbRuntimeMappingSnapshot;
  dbReference?: DbRuntimeReferenceSnapshot | null;
  referenceClass: ReferenceClass;
  consumerWordingMode: ConsumerWordingMode;
  consumerFacing: boolean;
}): IgnoredDbReferenceReason[] {
  const reasons: IgnoredDbReferenceReason[] = [];
  const { mapping, dbReference, referenceClass, consumerWordingMode, consumerFacing } = input;

  if (!mappingHasRuntimeLink(mapping)) reasons.push("mapping_unclear");
  if (!isApproved(mapping.reviewStatus)) reasons.push("mapping_unapproved");
  if (!isActive(mapping.activeStatus ?? mapping.active)) reasons.push("mapping_inactive");
  if (!dbReference) return [...reasons, "db_record_missing"];

  if (!isApproved(dbReference.reviewStatus)) reasons.push("db_record_unapproved");
  if (!isActive(dbReference.activeStatus)) reasons.push("db_record_inactive");
  if (isRepealedOrSuperseded(dbReference.repealOrSupersededStatus ?? dbReference.repealSupersededStatus)) {
    reasons.push("db_record_superseded_or_repealed");
  }
  if (!cleanString(dbReference.jurisdiction)) reasons.push("db_record_missing_jurisdiction");
  if (!categoryOf(dbReference)) reasons.push("db_record_missing_category");
  if (!titleOf(dbReference)) reasons.push("db_record_missing_title");
  if (!citationOf(dbReference)) reasons.push("db_record_missing_citation");
  if (
    referenceClass !== "private_standard" &&
    referenceClass !== "internal_only" &&
    !sourceUrlOf(dbReference)
  ) {
    reasons.push("db_record_missing_source_url");
  }
  if (consumerFacing && (referenceClass === "internal_only" || consumerWordingMode === "internal_only")) {
    reasons.push("internal_only_consumer_context");
  }

  return [...new Set(reasons)];
}

function limitedRuntimeUnsafeReasons(input: {
  staticReference: StaticRuntimeReferenceSnapshot | null;
  dbReference: DbRuntimeReferenceSnapshot;
  dbCandidate: ShadowDbReferenceCandidate;
  referenceDiffers: boolean;
  consumerFacingAllowed: boolean;
}): LimitedRuntimeUnsafeReason[] {
  const reasons: LimitedRuntimeUnsafeReason[] = ["shadow_mode_only"];
  if (!input.staticReference) reasons.push("static_fallback_missing");
  if (input.referenceDiffers) reasons.push("reference_mismatch");
  if (!input.consumerFacingAllowed) reasons.push("consumer_wording_unsafe");
  if (!input.dbReference.effectiveDate) reasons.push("missing_effective_date");
  if (input.dbReference.updateVersion === null || input.dbReference.updateVersion === undefined || input.dbReference.updateVersion === "") {
    reasons.push("missing_update_version");
  }
  return [...new Set(reasons)];
}

export function containsForbiddenConsumerReferenceLanguage(value: string | null | undefined): boolean {
  const text = cleanString(value);
  if (!text) return false;
  return FORBIDDEN_CONSUMER_REFERENCE_LANGUAGE.some((pattern) => pattern.test(text));
}

export function buildShadowConsumerReferenceLabel(input: {
  referenceClass: ReferenceClass;
  referenceText: string;
  consumerWordingMode?: ConsumerWordingMode | null;
}): string | null {
  const text = cleanString(input.referenceText) ?? "the mapped reference";
  const wordingMode = input.consumerWordingMode ?? inferConsumerWordingMode({ regulationId: "" }, input.referenceClass);

  if (input.referenceClass === "internal_only" || wordingMode === "internal_only") return null;
  if (input.referenceClass === "private_standard") {
    return "This item may require review against an industry reporting standard.";
  }
  if (input.referenceClass === "local_procedural") {
    return "This item may require procedural review.";
  }
  if (input.referenceClass === "regulator_guidance") {
    return `This item may require review against ${text}.`;
  }
  return `This item may require review under ${text}.`;
}

export function buildRegulationRuntimeBridgeShadowReport(
  input: RegulationRuntimeBridgeShadowInput,
): RegulationRuntimeBridgeShadowReport {
  const staticReferences = [...input.staticReferences];
  const staticViolationMappings = [...(input.staticViolationMappings ?? [])];
  const dbRegulations = [...input.dbRegulations];
  const dbMappings = [...(input.dbMappings ?? [])];
  const dbById = new Map(dbRegulations.map((reference) => [normalizeId(reference.regulationId), reference]));
  const relevantMappings = dbMappings.filter((mapping) => mappingMatchesContext(mapping, input.context));
  const consumerFacing = input.context?.consumerFacing ?? true;

  const shadowFindings: RegulationRuntimeBridgeShadowFinding[] = [];
  const ignoredDbReferences: IgnoredDbReference[] = [];

  for (const mapping of relevantMappings) {
    const dbReference = dbById.get(normalizeId(mapping.regulationId));
    const referenceClass = inferReferenceClass(mapping, dbReference);
    const consumerWordingMode = inferConsumerWordingMode(mapping, referenceClass);
    const ignoredReasons = evaluateIgnoredReasons({
      mapping,
      dbReference,
      referenceClass,
      consumerWordingMode,
      consumerFacing,
    });

    if (ignoredReasons.length > 0 || !dbReference) {
      ignoredDbReferences.push({
        dbRegulationId: mapping.regulationId,
        dbMappingId: mappingIdOf(mapping),
        deterministicRuleId: cleanString(mapping.deterministicRuleId ?? mapping.ruleId),
        violationCategory: cleanString(mapping.violationCategory),
        referenceClass,
        consumerWordingMode,
        reasons: ignoredReasons,
        limitedRuntimeUnsafe: true,
      });
      continue;
    }

    const title = titleOf(dbReference);
    const citation = citationOf(dbReference);
    const jurisdiction = cleanString(dbReference.jurisdiction);
    const category = categoryOf(dbReference);
    if (!title || !citation || !jurisdiction || !category) continue;

    const staticReference = staticReferenceForDbAlternative(
      mapping,
      staticReferences,
      staticViolationMappings,
      input.context,
    );
    const dbCandidate: ShadowDbReferenceCandidate = {
      dbRegulationId: dbReference.regulationId,
      dbMappingId: mappingIdOf(mapping),
      title,
      citation,
      jurisdiction,
      category,
      sourceUrl: sourceUrlOf(dbReference),
      effectiveDate: dateToString(dbReference.effectiveDate),
      updateVersion: dbReference.updateVersion === null || dbReference.updateVersion === undefined
        ? null
        : String(dbReference.updateVersion),
      referenceClass,
      consumerWordingMode,
    };
    const referenceDiffers = referencesDiffer(staticReference, dbCandidate);
    const allowed = consumerFacingAllowed(referenceClass, consumerWordingMode);
    const unsafeReasons = limitedRuntimeUnsafeReasons({
      staticReference,
      dbReference,
      dbCandidate,
      referenceDiffers,
      consumerFacingAllowed: allowed,
    });

    shadowFindings.push({
      staticReferenceId: staticReference?.id ?? null,
      dbRegulationId: dbReference.regulationId,
      dbMappingId: mappingIdOf(mapping),
      deterministicRuleId: cleanString(mapping.deterministicRuleId ?? mapping.ruleId),
      violationCategory: cleanString(mapping.violationCategory),
      mismatchType: !staticReference
        ? "db_alternative_missing_static_reference"
        : referenceDiffers
          ? "db_alternative_differs_from_static"
          : "db_alternative_matches_static",
      referenceClass,
      consumerWordingMode,
      staticReference,
      dbReferenceCandidate: dbCandidate,
      reason: "DB reference is approved and active for shadow comparison only; static runtime reference remains active.",
      limitedRuntimeUnsafe: unsafeReasons.length > 0,
      limitedRuntimeUnsafeReasons: unsafeReasons,
      consumerFacingAllowed: allowed,
    });
  }

  return {
    bridgeMode: "shadow",
    runtimeSourceUsed: "static_runtime",
    activeReferenceResult: {
      runtimeSourceUsed: "static_runtime",
      references: activeStaticReferencesForInput(input),
    },
    shadowFindings,
    ignoredDbReferences,
  };
}
