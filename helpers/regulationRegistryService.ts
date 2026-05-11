import { sql, type Selectable } from "kysely";
import { db } from "./db";
import { BusinessRuleError } from "./endpointErrorHandler";
import { ensureRegulationRegistrySchema } from "./regulationRegistrySchema";
import type {
  RegulationRegistry,
  RegulationUpdateCandidate,
  RegulationUpdateMode,
  RegulationUpdateSource,
} from "./schema";
import {
  assessRegulationConfidence,
  buildRegulationDiff,
  classifyRegulationCandidate,
  hashRegulationText,
  isAuthoritativeSourceUrl,
  parserSafeNormalizeText,
  stripHtmlToText,
  validateRegulationApprovalSafety,
  type ExistingRegulationSnapshot,
  type RegulationDraft,
} from "./regulationUpdateEngine";

export interface CandidateCreationResult {
  candidate: Selectable<RegulationUpdateCandidate> | null;
  skippedReason: string | null;
}

export interface RegulationScanInput {
  mode: RegulationUpdateMode;
  triggeredByUserId?: number | null;
  sourceDocuments?: RegulationDraft[];
  fetchConfiguredSources?: boolean;
}

export interface RegulationScanResult {
  inserted: number;
  skipped: number;
  errors: string[];
  candidateIds: number[];
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toNumeric(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function candidateToDraft(candidate: Selectable<RegulationUpdateCandidate>): RegulationDraft {
  return {
    regulationId: candidate.candidateRegulationId,
    jurisdiction: candidate.jurisdiction,
    authoritySource: candidate.authoritySource,
    regulationTitle: candidate.regulationTitle,
    sectionNumber: candidate.sectionNumber,
    subsection: candidate.subsection,
    shortTitle: candidate.shortTitle,
    fullText: candidate.fullText,
    plainLanguageSummary: candidate.plainLanguageSummary,
    officialSourceUrl: candidate.officialSourceUrl,
    publicationDate: candidate.publicationDate,
    effectiveDate: candidate.effectiveDate,
    repealSupersededStatus: candidate.repealSupersededStatus,
    regulationCategory: candidate.regulationCategory,
    tags: candidate.tags ?? [],
    citationFormat: candidate.citationFormat,
    sourceDocumentUrl: candidate.sourceDocumentUrl,
  };
}

async function getLatestRegulationSnapshot(regulationId: string): Promise<ExistingRegulationSnapshot | null> {
  const existing = await db
    .selectFrom("regulationRegistry")
    .select([
      "id",
      "regulationId",
      "regulationTitle",
      "sectionNumber",
      "subsection",
      "fullText",
      "parserSafeNormalizedText",
      "updateVersion",
      "officialSourceUrl",
    ])
    .where("regulationId", "=", regulationId)
    .orderBy("updateVersion", "desc")
    .executeTakeFirst();

  return existing ?? null;
}

async function findDuplicateRegulationIds(input: RegulationDraft, normalizedTextHash: string): Promise<number[]> {
  const rows = await db
    .selectFrom("regulationRegistry")
    .select(["id", "regulationId", "regulationTitle", "sectionNumber", "sourceContentHash"])
    .where("jurisdiction", "=", input.jurisdiction)
    .where("regulationId", "!=", input.regulationId)
    .limit(100)
    .execute();

  const title = input.regulationTitle.trim().toLowerCase();
  const section = input.sectionNumber.trim().toLowerCase();

  return rows
    .filter((row) => {
      if (row.sourceContentHash === normalizedTextHash) return true;
      return row.regulationTitle.trim().toLowerCase() === title && row.sectionNumber.trim().toLowerCase() === section;
    })
    .map((row) => row.id);
}

export async function createRegulationCandidate(
  draft: RegulationDraft,
  options: {
    sourceScanId?: number | null;
    allowUnchanged?: boolean;
  } = {},
): Promise<CandidateCreationResult> {
  await ensureRegulationRegistrySchema();

  const parserSafeNormalizedText = parserSafeNormalizeText(draft.fullText);
  const normalizedTextHash = hashRegulationText(draft.fullText);
  const existing = await getLatestRegulationSnapshot(draft.regulationId);
  const duplicateIds = await findDuplicateRegulationIds(draft, normalizedTextHash);
  const confidence = assessRegulationConfidence(draft);
  const changeClassification = classifyRegulationCandidate({
    candidate: draft,
    existing,
    possibleDuplicateCount: duplicateIds.length,
  });
  const diffReport = buildRegulationDiff(existing?.fullText ?? null, draft.fullText);
  const proposedVersion = existing ? existing.updateVersion + 1 : 1;

  if (changeClassification === "unchanged" && !options.allowUnchanged) {
    return { candidate: null, skippedReason: "no wording change detected" };
  }

  const candidate = await db
    .insertInto("regulationUpdateCandidate")
    .values({
      candidateRegulationId: draft.regulationId,
      existingRegulationRecordId: existing?.id ?? null,
      sourceScanId: options.sourceScanId ?? null,
      changeClassification,
      status: "pending_review",
      jurisdiction: draft.jurisdiction,
      authoritySource: draft.authoritySource,
      regulationTitle: draft.regulationTitle,
      sectionNumber: draft.sectionNumber,
      subsection: draft.subsection ?? null,
      shortTitle: draft.shortTitle,
      fullText: draft.fullText,
      plainLanguageSummary: draft.plainLanguageSummary,
      officialSourceUrl: draft.officialSourceUrl,
      publicationDate: toDate(draft.publicationDate),
      effectiveDate: toDate(draft.effectiveDate),
      repealSupersededStatus: draft.repealSupersededStatus || "current",
      regulationCategory: draft.regulationCategory,
      tags: draft.tags ?? [],
      parserSafeNormalizedText,
      citationFormat: draft.citationFormat,
      proposedVersion,
      normalizedTextHash,
      confidenceScore: confidence.confidenceScore,
      diffReport: diffReport as any,
      confidenceReasons: confidence.reasons,
      ambiguityReasons: confidence.ambiguityReasons,
      duplicateCandidateIds: duplicateIds,
      sourceDocumentUrl: draft.sourceDocumentUrl ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return { candidate, skippedReason: null };
}

export async function approveRegulationCandidate(input: {
  candidateId: number;
  adminUserId: number;
  reviewNotes?: string | null;
}): Promise<Selectable<RegulationRegistry>> {
  await ensureRegulationRegistrySchema();

  const candidate = await db
    .selectFrom("regulationUpdateCandidate")
    .selectAll()
    .where("id", "=", input.candidateId)
    .executeTakeFirst();

  if (!candidate) {
    throw new BusinessRuleError("Regulation update candidate not found", 404);
  }

  if (candidate.status !== "pending_review") {
    throw new BusinessRuleError("Only pending regulation candidates can be approved");
  }

  const draft = candidateToDraft(candidate);
  const safety = validateRegulationApprovalSafety({
    ...draft,
    changeClassification: candidate.changeClassification,
  });

  if (!safety.ok) {
    throw new BusinessRuleError(safety.errors.join("; "));
  }

  const activeStatus = candidate.changeClassification === "repealed" ? "inactive" : "active";
  const repealSupersededStatus = candidate.changeClassification === "repealed"
    ? "repealed"
    : candidate.repealSupersededStatus || "current";
  const now = new Date();

  return await db.transaction().execute(async (trx) => {
    const superseded = await trx
      .updateTable("regulationRegistry")
      .set({ activeStatus: "superseded", updatedAt: now })
      .where("regulationId", "=", candidate.candidateRegulationId)
      .where("activeStatus", "=", "active")
      .returning("id")
      .execute();

    const record = await trx
      .insertInto("regulationRegistry")
      .values({
        regulationId: candidate.candidateRegulationId,
        jurisdiction: candidate.jurisdiction,
        authoritySource: candidate.authoritySource,
        regulationTitle: candidate.regulationTitle,
        sectionNumber: candidate.sectionNumber,
        subsection: candidate.subsection,
        shortTitle: candidate.shortTitle,
        fullText: candidate.fullText,
        plainLanguageSummary: candidate.plainLanguageSummary,
        officialSourceUrl: candidate.officialSourceUrl,
        publicationDate: candidate.publicationDate,
        effectiveDate: candidate.effectiveDate,
        repealSupersededStatus,
        regulationCategory: candidate.regulationCategory,
        tags: candidate.tags ?? [],
        parserSafeNormalizedText: candidate.parserSafeNormalizedText,
        citationFormat: candidate.citationFormat,
        updateVersion: candidate.proposedVersion,
        activeStatus,
        reviewStatus: "approved",
        confidenceScore: toNumeric(candidate.confidenceScore),
        sourceContentHash: candidate.normalizedTextHash,
        sourceDocumentUrl: candidate.sourceDocumentUrl,
        supersedesRecordId: candidate.existingRegulationRecordId,
        approvalNotes: input.reviewNotes ?? null,
        approvedBy: input.adminUserId,
        approvedAt: now,
        updatedAt: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    if (superseded.length > 0) {
      await trx
        .updateTable("regulationRegistry")
        .set({ supersededByRecordId: record.id, updatedAt: now })
        .where("id", "in", superseded.map((row) => row.id))
        .execute();
    }

    await trx
      .updateTable("regulationUpdateCandidate")
      .set({
        status: "approved",
        reviewedAt: now,
        reviewedBy: input.adminUserId,
        reviewNotes: input.reviewNotes ?? (safety.warnings.join("; ") || null),
        createdRegulationRecordId: record.id,
      })
      .where("id", "=", candidate.id)
      .execute();

    return record;
  });
}

export async function rejectRegulationCandidate(input: {
  candidateId: number;
  adminUserId: number;
  reviewNotes?: string | null;
}): Promise<Selectable<RegulationUpdateCandidate>> {
  await ensureRegulationRegistrySchema();

  const rejected = await db
    .updateTable("regulationUpdateCandidate")
    .set({
      status: "rejected",
      reviewedAt: new Date(),
      reviewedBy: input.adminUserId,
      reviewNotes: input.reviewNotes ?? null,
    })
    .where("id", "=", input.candidateId)
    .where("status", "=", "pending_review")
    .returningAll()
    .executeTakeFirst();

  if (!rejected) {
    throw new BusinessRuleError("Pending regulation candidate not found", 404);
  }

  return rejected;
}

export async function deactivateRegulationRecord(input: {
  recordId: number;
  adminUserId: number;
  reason?: string | null;
}): Promise<Selectable<RegulationRegistry>> {
  await ensureRegulationRegistrySchema();

  const updated = await db
    .updateTable("regulationRegistry")
    .set({
      activeStatus: "inactive",
      updatedAt: new Date(),
      approvalNotes: input.reason ?? null,
    })
    .where("id", "=", input.recordId)
    .returningAll()
    .executeTakeFirst();

  if (!updated) {
    throw new BusinessRuleError("Regulation record not found", 404);
  }

  return updated;
}

export async function restoreRegulationVersion(input: {
  recordId: number;
  adminUserId: number;
  reason?: string | null;
}): Promise<Selectable<RegulationRegistry>> {
  await ensureRegulationRegistrySchema();

  const target = await db
    .selectFrom("regulationRegistry")
    .selectAll()
    .where("id", "=", input.recordId)
    .executeTakeFirst();

  if (!target) {
    throw new BusinessRuleError("Regulation record not found", 404);
  }

  if (target.reviewStatus !== "approved") {
    throw new BusinessRuleError("Only approved regulation versions can be restored");
  }

  if (String(target.repealSupersededStatus).toLowerCase().includes("repeal")) {
    throw new BusinessRuleError("Repealed regulation versions cannot be restored as active truth");
  }

  const now = new Date();

  return await db.transaction().execute(async (trx) => {
    await trx
      .updateTable("regulationRegistry")
      .set({ activeStatus: "superseded", updatedAt: now })
      .where("regulationId", "=", target.regulationId)
      .where("id", "!=", target.id)
      .where("activeStatus", "=", "active")
      .execute();

    return await trx
      .updateTable("regulationRegistry")
      .set({
        activeStatus: "active",
        updatedAt: now,
        approvalNotes: input.reason ?? target.approvalNotes,
      })
      .where("id", "=", target.id)
      .returningAll()
      .executeTakeFirstOrThrow();
  });
}

export async function rebuildRegulationIndexes(): Promise<{ rebuilt: number }> {
  await ensureRegulationRegistrySchema();

  const rows = await db
    .selectFrom("regulationRegistry")
    .select(["id", "fullText", "parserSafeNormalizedText"])
    .execute();

  let rebuilt = 0;
  for (const row of rows) {
    const normalized = parserSafeNormalizeText(row.fullText);
    if (normalized !== row.parserSafeNormalizedText) {
      await db
        .updateTable("regulationRegistry")
        .set({
          parserSafeNormalizedText: normalized,
          sourceContentHash: hashRegulationText(row.fullText),
          updatedAt: new Date(),
        })
        .where("id", "=", row.id)
        .execute();
      rebuilt++;
    }
  }

  return { rebuilt };
}

async function fetchSourceText(sourceUrl: string): Promise<string> {
  if (!isAuthoritativeSourceUrl(sourceUrl)) {
    throw new BusinessRuleError("Configured source URL is not authoritative");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(sourceUrl, {
      headers: { "User-Agent": "CreditRegulatorPro-RegulationScanner/1.0" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`source returned ${response.status}`);
    }
    return stripHtmlToText(await response.text()).slice(0, 60_000);
  } finally {
    clearTimeout(timeout);
  }
}

function sourceToPlaceholderDraft(source: Selectable<RegulationUpdateSource>, text: string, hash: string): RegulationDraft {
  return {
    regulationId: `SOURCE_CHANGE_${source.id}_${hash.slice(0, 12).toUpperCase()}`,
    jurisdiction: source.jurisdiction,
    authoritySource: source.authoritySource,
    regulationTitle: `Potential source change: ${source.name}`,
    sectionNumber: "source-scan",
    subsection: null,
    shortTitle: source.name,
    fullText: text,
    plainLanguageSummary:
      "A configured authoritative source changed. Admin must isolate the exact regulation, section, and wording before approval.",
    officialSourceUrl: source.sourceUrl,
    publicationDate: null,
    effectiveDate: null,
    repealSupersededStatus: "source_changed_pending_review",
    regulationCategory: source.regulationCategory,
    tags: ["source_scan", "manual_review_required"],
    citationFormat: source.sourceUrl,
    sourceDocumentUrl: source.sourceUrl,
  };
}

export async function runRegulationUpdateScan(input: RegulationScanInput): Promise<RegulationScanResult> {
  await ensureRegulationRegistrySchema();

  const result: RegulationScanResult = {
    inserted: 0,
    skipped: 0,
    errors: [],
    candidateIds: [],
  };

  const sourceDocuments = input.sourceDocuments ?? [];
  for (const document of sourceDocuments) {
    try {
      const created = await createRegulationCandidate(document);
      if (created.candidate) {
        result.inserted++;
        result.candidateIds.push(created.candidate.id);
      } else {
        result.skipped++;
      }
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (!input.fetchConfiguredSources) {
    return result;
  }

  const sources = await db
    .selectFrom("regulationUpdateSource")
    .selectAll()
    .where("enabled", "=", true)
    .where((eb) =>
      input.mode === "scheduled"
        ? eb("updateMode", "=", "scheduled")
        : eb("updateMode", "in", ["assisted", "scheduled"])
    )
    .execute();

  for (const source of sources) {
    const scan = await db
      .insertInto("regulationSourceScan")
      .values({
        sourceId: source.id,
        triggeredBy: input.triggeredByUserId ?? null,
        mode: input.mode,
        status: "started",
        fetchedUrl: source.sourceUrl,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    try {
      const text = await fetchSourceText(source.sourceUrl);
      const hash = hashRegulationText(text);

      await db
        .updateTable("regulationUpdateSource")
        .set({ lastCheckedAt: new Date(), updatedAt: new Date() })
        .where("id", "=", source.id)
        .execute();

      if (source.lastContentHash === hash) {
        result.skipped++;
        await db
          .updateTable("regulationSourceScan")
          .set({ status: "completed", completedAt: new Date(), contentHash: hash })
          .where("id", "=", scan.id)
          .execute();
        continue;
      }

      const created = await createRegulationCandidate(
        sourceToPlaceholderDraft(source, text, hash),
        { sourceScanId: scan.id, allowUnchanged: true },
      );

      if (created.candidate) {
        result.inserted++;
        result.candidateIds.push(created.candidate.id);
      }

      await db
        .updateTable("regulationUpdateSource")
        .set({ lastContentHash: hash, lastCheckedAt: new Date(), updatedAt: new Date() })
        .where("id", "=", source.id)
        .execute();

      await db
        .updateTable("regulationSourceScan")
        .set({
          status: "completed",
          completedAt: new Date(),
          contentHash: hash,
          detectedChangeCount: created.candidate ? 1 : 0,
        })
        .where("id", "=", scan.id)
        .execute();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`${source.name}: ${message}`);
      await db
        .updateTable("regulationSourceScan")
        .set({ status: "failed", completedAt: new Date(), errorMessage: message })
        .where("id", "=", scan.id)
        .execute();
    }
  }

  return result;
}

export async function listMappingsWithRegulations() {
  await ensureRegulationRegistrySchema();

  return await db
    .selectFrom("regulationViolationMapping")
    .leftJoin("regulationRegistry", "regulationViolationMapping.regulationRecordId", "regulationRegistry.id")
    .select([
      "regulationViolationMapping.id",
      "regulationViolationMapping.violationCategory",
      "regulationViolationMapping.regulationId",
      "regulationViolationMapping.regulationRecordId",
      "regulationViolationMapping.sectionNumber",
      "regulationViolationMapping.subsection",
      "regulationViolationMapping.jurisdiction",
      "regulationViolationMapping.explanationTemplate",
      "regulationViolationMapping.active",
      "regulationViolationMapping.reviewStatus",
      "regulationViolationMapping.approvedAt",
      "regulationRegistry.regulationTitle as regulationTitle",
      "regulationRegistry.shortTitle as regulationShortTitle",
    ])
    .orderBy("regulationViolationMapping.violationCategory", "asc")
    .orderBy("regulationViolationMapping.regulationId", "asc")
    .execute();
}

export async function upsertRegulationViolationMapping(input: {
  id?: number | null;
  violationCategory: string;
  regulationId: string;
  regulationRecordId?: number | null;
  sectionNumber: string;
  subsection?: string | null;
  jurisdiction: string;
  explanationTemplate: string;
  active?: boolean;
  adminUserId: number;
}) {
  await ensureRegulationRegistrySchema();

  const now = new Date();
  if (input.id) {
    return await db
      .updateTable("regulationViolationMapping")
      .set({
        violationCategory: input.violationCategory,
        regulationId: input.regulationId,
        regulationRecordId: input.regulationRecordId ?? null,
        sectionNumber: input.sectionNumber,
        subsection: input.subsection ?? null,
        jurisdiction: input.jurisdiction,
        explanationTemplate: input.explanationTemplate,
        active: input.active ?? true,
        reviewStatus: "approved",
        approvedBy: input.adminUserId,
        approvedAt: now,
        updatedAt: now,
      })
      .where("id", "=", input.id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  return await db
    .insertInto("regulationViolationMapping")
    .values({
      violationCategory: input.violationCategory,
      regulationId: input.regulationId,
      regulationRecordId: input.regulationRecordId ?? null,
      sectionNumber: input.sectionNumber,
      subsection: input.subsection ?? null,
      jurisdiction: input.jurisdiction,
      explanationTemplate: input.explanationTemplate,
      active: input.active ?? true,
      reviewStatus: "approved",
      approvedBy: input.adminUserId,
      approvedAt: now,
      updatedAt: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}
