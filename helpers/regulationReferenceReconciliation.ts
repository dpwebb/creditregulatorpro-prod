export type RegulationReferenceMismatchType =
  | "missing_db_registry_record"
  | "missing_static_reference"
  | "citation_mismatch"
  | "jurisdiction_mismatch"
  | "source_url_missing"
  | "effective_date_missing"
  | "approval_status_missing"
  | "title_mismatch"
  | "category_mismatch"
  | "unclear_mapping"
  | "consumer_wording_risk";

export type RegulationReferenceReconciliationSeverity = "low" | "medium" | "high";

export type StaticReferenceSnapshot = {
  id: string;
  title?: string | null;
  jurisdiction?: string | null;
  category?: string | null;
  citation?: string | null;
  sourceUrl?: string | null;
  referenceType?: string | null;
  sourceQuality?: string | null;
  consumerFacing?: boolean | null;
  label?: string | null;
  description?: string | null;
  applicationText?: string | null;
};

export type StaticViolationReferenceMappingSnapshot = {
  ruleId?: string | null;
  violationCategory?: string | null;
  regulationId: string;
};

export type DbRegulationSnapshot = {
  regulationId: string;
  title?: string | null;
  jurisdiction?: string | null;
  category?: string | null;
  citationFormat?: string | null;
  sourceUrl?: string | null;
  effectiveDate?: string | Date | null;
  reviewStatus?: string | null;
  activeStatus?: string | null;
  updateVersion?: string | number | null;
  referenceType?: string | null;
};

export type DbMappingSnapshot = {
  ruleId?: string | null;
  violationCategory?: string | null;
  regulationId: string;
  reviewStatus?: string | null;
  activeStatus?: string | boolean | null;
  active?: boolean | null;
  explanationTemplate?: string | null;
  consumerFacing?: boolean | null;
};

export type RegulationReferenceReconciliationFinding = {
  staticReferenceId?: string;
  dbRegulationId?: string;
  mismatchType: RegulationReferenceMismatchType;
  severity: RegulationReferenceReconciliationSeverity;
  message: string;
  recommendedAction: string;
};

export type RegulationReferenceReconciliationInput = {
  staticReferences: StaticReferenceSnapshot[];
  staticViolationMappings?: StaticViolationReferenceMappingSnapshot[];
  dbRegulations: DbRegulationSnapshot[];
  dbMappings?: DbMappingSnapshot[];
};

const RISKY_CONSUMER_REFERENCE_LANGUAGE: RegExp[] = [
  /\bconfirmed legal violation\b/i,
  /\bthis is illegal\b/i,
  /\bviolates? the law\b/i,
  /\bviolation of law\b/i,
  /\bentitled to damages\b/i,
  /\bthe bureau broke the law\b/i,
  /\bmust pay\b/i,
  /\bwe will sue\b/i,
  /\blawsuit\b/i,
  /\blegal action will be taken\b/i,
  /\bthreaten(?:ed|ing)?\b/i,
];

function hasValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeId(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeText(value: string | number | Date | null | undefined): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isApproved(value: string | null | undefined): boolean {
  return normalizeText(value) === "approved";
}

function isActive(value: string | boolean | null | undefined): boolean {
  if (typeof value === "boolean") return value;
  return normalizeText(value) === "active" || normalizeText(value) === "true";
}

function isOfficialLikeReference(input: {
  referenceType?: string | null;
  sourceQuality?: string | null;
  category?: string | null;
}): boolean {
  const sourceQuality = normalizeText(input.sourceQuality);
  const referenceType = normalizeText(input.referenceType);
  const category = normalizeText(input.category);

  if (sourceQuality === "private standard" || sourceQuality === "local registry") return false;
  if (referenceType === "reporting standard" || referenceType === "local registry entry") return false;
  if (category === "reporting standard" || category === "private standard" || category === "local registry") return false;
  return sourceQuality === "official" || referenceType === "statute" || referenceType === "privacy principle";
}

function dbRowRequiresEffectiveDate(row: DbRegulationSnapshot): boolean {
  const category = normalizeText(row.category);
  const referenceType = normalizeText(row.referenceType);
  if (!category && !referenceType) return false;
  if (category === "reporting standard" || category === "private standard") return false;
  if (referenceType === "reporting standard" || referenceType === "local registry entry") return false;
  return true;
}

function hasRiskyConsumerReferenceLanguage(text: string | null | undefined): boolean {
  if (!hasValue(text)) return false;
  return RISKY_CONSUMER_REFERENCE_LANGUAGE.some((pattern) => pattern.test(text));
}

function addFinding(
  findings: RegulationReferenceReconciliationFinding[],
  finding: RegulationReferenceReconciliationFinding,
) {
  findings.push(finding);
}

function staticMappingKey(mapping: StaticViolationReferenceMappingSnapshot): string {
  return [
    normalizeText(mapping.ruleId),
    normalizeText(mapping.violationCategory),
    normalizeId(mapping.regulationId),
  ].join("|");
}

export function detectConsumerReferenceWordingRisk(input: Pick<
  StaticReferenceSnapshot,
  "label" | "title" | "description" | "applicationText"
>): boolean {
  return [input.label, input.title, input.description, input.applicationText].some(hasRiskyConsumerReferenceLanguage);
}

export function reconcileRegulationReferences(
  input: RegulationReferenceReconciliationInput,
): RegulationReferenceReconciliationFinding[] {
  const findings: RegulationReferenceReconciliationFinding[] = [];
  const staticReferences = [...input.staticReferences];
  const staticViolationMappings = [...(input.staticViolationMappings ?? [])];
  const dbRegulations = [...input.dbRegulations];
  const dbMappings = [...(input.dbMappings ?? [])];

  const staticById = new Map(staticReferences.map((reference) => [normalizeId(reference.id), reference]));
  const dbById = new Map(dbRegulations.map((reference) => [normalizeId(reference.regulationId), reference]));
  const staticMappingKeys = new Set(staticViolationMappings.map(staticMappingKey));
  const staticMappingRegulationIds = new Set(staticViolationMappings.map((mapping) => normalizeId(mapping.regulationId)));

  for (const staticReference of staticReferences) {
    const dbReference = dbById.get(normalizeId(staticReference.id));
    if (!dbReference) {
      addFinding(findings, {
        staticReferenceId: staticReference.id,
        mismatchType: "missing_db_registry_record",
        severity: staticReference.consumerFacing ? "high" : "medium",
        message: `Static runtime reference ${staticReference.id} has no matching DB governance registry record.`,
        recommendedAction: "Review whether an inert DB registry record should be created and approved before any future bridge uses this reference.",
      });
    }

    if (
      isOfficialLikeReference(staticReference) &&
      !hasValue(staticReference.sourceUrl)
    ) {
      addFinding(findings, {
        staticReferenceId: staticReference.id,
        dbRegulationId: dbReference?.regulationId,
        mismatchType: "source_url_missing",
        severity: "high",
        message: `Static official reference ${staticReference.id} is missing a source URL.`,
        recommendedAction: "Add source review as an inert governance task; do not invent a URL or alter runtime references.",
      });
    }

    if (staticReference.consumerFacing && detectConsumerReferenceWordingRisk(staticReference)) {
      addFinding(findings, {
        staticReferenceId: staticReference.id,
        dbRegulationId: dbReference?.regulationId,
        mismatchType: "consumer_wording_risk",
        severity: "high",
        message: `Static reference ${staticReference.id} contains consumer-facing wording that may sound conclusive.`,
        recommendedAction: "Review wording so consumer-facing surfaces frame the item as requiring review rather than a legal conclusion.",
      });
    }

    if (!dbReference) continue;

    if (
      hasValue(staticReference.citation) &&
      hasValue(dbReference.citationFormat) &&
      normalizeText(staticReference.citation) !== normalizeText(dbReference.citationFormat)
    ) {
      addFinding(findings, {
        staticReferenceId: staticReference.id,
        dbRegulationId: dbReference.regulationId,
        mismatchType: "citation_mismatch",
        severity: "high",
        message: `Static citation for ${staticReference.id} does not match the DB citation format.`,
        recommendedAction: "Review the static citation and DB citation side by side before approving any runtime bridge.",
      });
    }

    if (
      hasValue(staticReference.title) &&
      hasValue(dbReference.title) &&
      normalizeText(staticReference.title) !== normalizeText(dbReference.title)
    ) {
      addFinding(findings, {
        staticReferenceId: staticReference.id,
        dbRegulationId: dbReference.regulationId,
        mismatchType: "title_mismatch",
        severity: "medium",
        message: `Static title for ${staticReference.id} does not match the DB title.`,
        recommendedAction: "Review whether the static and DB records refer to the same authority before creating an approved mapping.",
      });
    }

    if (
      hasValue(staticReference.jurisdiction) &&
      hasValue(dbReference.jurisdiction) &&
      normalizeText(staticReference.jurisdiction) !== normalizeText(dbReference.jurisdiction)
    ) {
      addFinding(findings, {
        staticReferenceId: staticReference.id,
        dbRegulationId: dbReference.regulationId,
        mismatchType: "jurisdiction_mismatch",
        severity: "high",
        message: `Static jurisdiction for ${staticReference.id} does not match the DB jurisdiction.`,
        recommendedAction: "Resolve the jurisdiction mismatch before any DB-approved record can influence runtime reference metadata.",
      });
    }

    if (
      hasValue(staticReference.category) &&
      hasValue(dbReference.category) &&
      normalizeText(staticReference.category) !== normalizeText(dbReference.category)
    ) {
      addFinding(findings, {
        staticReferenceId: staticReference.id,
        dbRegulationId: dbReference.regulationId,
        mismatchType: "category_mismatch",
        severity: "medium",
        message: `Static category for ${staticReference.id} does not match the DB category.`,
        recommendedAction: "Review category alignment as advisory governance metadata only.",
      });
    }
  }

  for (const dbReference of dbRegulations) {
    const staticReference = staticById.get(normalizeId(dbReference.regulationId));

    if (!staticReference) {
      addFinding(findings, {
        dbRegulationId: dbReference.regulationId,
        mismatchType: "missing_static_reference",
        severity: isApproved(dbReference.reviewStatus) && isActive(dbReference.activeStatus) ? "high" : "medium",
        message: `DB governance registry record ${dbReference.regulationId} has no matching static runtime reference.`,
        recommendedAction: "Keep the DB record inert until a reviewed bridge decision explicitly maps it to a stable runtime reference.",
      });
    }

    if (!hasValue(dbReference.sourceUrl)) {
      addFinding(findings, {
        staticReferenceId: staticReference?.id,
        dbRegulationId: dbReference.regulationId,
        mismatchType: "source_url_missing",
        severity: isApproved(dbReference.reviewStatus) || isActive(dbReference.activeStatus) ? "high" : "medium",
        message: `DB governance registry record ${dbReference.regulationId} is missing a source URL.`,
        recommendedAction: "Require source review before approval or any future runtime bridge use.",
      });
    }

    if (dbRowRequiresEffectiveDate(dbReference) && !dbReference.effectiveDate) {
      addFinding(findings, {
        staticReferenceId: staticReference?.id,
        dbRegulationId: dbReference.regulationId,
        mismatchType: "effective_date_missing",
        severity: isApproved(dbReference.reviewStatus) || isActive(dbReference.activeStatus) ? "medium" : "low",
        message: `DB governance registry record ${dbReference.regulationId} is missing an effective date.`,
        recommendedAction: "Review the authoritative source and record the effective date before relying on the DB row for governance decisions.",
      });
    }

    if (!isApproved(dbReference.reviewStatus)) {
      addFinding(findings, {
        staticReferenceId: staticReference?.id,
        dbRegulationId: dbReference.regulationId,
        mismatchType: "approval_status_missing",
        severity: isActive(dbReference.activeStatus) ? "high" : "medium",
        message: `DB governance registry record ${dbReference.regulationId} is not marked approved.`,
        recommendedAction: "Keep the row inert until review status is approved through the governance workflow.",
      });
    }
  }

  for (const dbMapping of dbMappings) {
    const mappingKey = staticMappingKey(dbMapping);
    const hasStaticReference = staticById.has(normalizeId(dbMapping.regulationId));
    const hasDbReference = dbById.has(normalizeId(dbMapping.regulationId));
    const hasStaticRuntimeMapping =
      staticMappingKeys.has(mappingKey) ||
      Boolean(dbMapping.ruleId && hasStaticReference) ||
      (Boolean(dbMapping.violationCategory) && staticMappingRegulationIds.has(normalizeId(dbMapping.regulationId)));

    if (!hasStaticReference || !hasDbReference || !hasStaticRuntimeMapping || (!dbMapping.ruleId && !dbMapping.violationCategory)) {
      addFinding(findings, {
        staticReferenceId: hasStaticReference ? dbMapping.regulationId : undefined,
        dbRegulationId: dbMapping.regulationId,
        mismatchType: "unclear_mapping",
        severity: isActive(dbMapping.activeStatus) || dbMapping.active ? "high" : "medium",
        message: `DB regulation mapping for ${dbMapping.regulationId} cannot be tied clearly to a static runtime reference or deterministic rule.`,
        recommendedAction: "Treat the mapping as advisory only until it is tied to a stable static reference and reviewed rule/category mapping.",
      });
    }

    if (!isApproved(dbMapping.reviewStatus)) {
      addFinding(findings, {
        staticReferenceId: hasStaticReference ? dbMapping.regulationId : undefined,
        dbRegulationId: dbMapping.regulationId,
        mismatchType: "approval_status_missing",
        severity: isActive(dbMapping.activeStatus) || dbMapping.active ? "high" : "medium",
        message: `DB regulation mapping for ${dbMapping.regulationId} is not marked approved.`,
        recommendedAction: "Keep the mapping inert until it is approved through the governance workflow.",
      });
    }

    if ((dbMapping.consumerFacing ?? true) && hasRiskyConsumerReferenceLanguage(dbMapping.explanationTemplate)) {
      addFinding(findings, {
        staticReferenceId: hasStaticReference ? dbMapping.regulationId : undefined,
        dbRegulationId: dbMapping.regulationId,
        mismatchType: "consumer_wording_risk",
        severity: "high",
        message: `DB regulation mapping for ${dbMapping.regulationId} contains wording that may sound conclusive.`,
        recommendedAction: "Review wording so future consumer-facing surfaces use neutral review language.",
      });
    }
  }

  return findings;
}
