import { z } from "zod";
import type { Selectable } from "kysely";
import type {
  CreditorObligationTest,
  Json,
  Tradeline,
  ViolationCorrection,
  ViolationCorrectionEvidence,
  ViolationRegulationReference,
  ViolationTrainingExample,
} from "../../../helpers/schema";
import {
  CORRECTION_ACTIONS,
  CORRECTION_STATUSES,
  REGULATION_JURISDICTIONS,
  TRAINING_LABELS,
} from "../../../helpers/violationCorrectionValidation";

export const correctionActionSchema = z.enum(CORRECTION_ACTIONS);
export const correctionStatusSchema = z.enum(CORRECTION_STATUSES);
export const trainingLabelSchema = z.enum(TRAINING_LABELS);
export const regulationJurisdictionSchema = z.enum(REGULATION_JURISDICTIONS);
export const idSchema = z.coerce.number().int().min(1);

export const correctionPayloadSchema = z.object({
  extractionRunId: idSchema,
  tradelineId: idSchema,
  originalViolationId: idSchema.nullable().optional(),
  correctionAction: correctionActionSchema,
  correctedViolationType: z.string().trim().min(1).nullable().optional(),
  correctedSummary: z.string().trim().nullable().optional(),
  correctedExplanation: z.string().trim().nullable().optional(),
  correctedSeverity: z.string().trim().nullable().optional(),
  correctedConfidence: z.coerce.number().min(0).max(100).nullable().optional(),
  correctionReason: z.string().trim().nullable().optional(),
  adminNotes: z.string().trim().nullable().optional(),
  status: correctionStatusSchema.optional(),
  trainingLabel: trainingLabelSchema.nullable().optional(),
  trainingNoteOnly: z.boolean().optional(),
  useForTraining: z.boolean().optional(),
});

export const evidencePayloadSchema = z.object({
  sourceDocumentId: idSchema,
  extractionRunId: idSchema,
  tradelineId: idSchema,
  pageNumber: z.coerce.number().int().min(1),
  fieldName: z.string().trim().nullable().optional(),
  textExcerpt: z.string().trim().min(1),
  normalizedValue: z.string().trim().nullable().optional(),
  evidenceReason: z.string().trim().min(1),
  adminSelected: z.boolean().optional(),
});

export const regulationReferencePayloadSchema = z.object({
  violationId: idSchema.nullable().optional(),
  correctionId: idSchema.nullable().optional(),
  extractionRunId: idSchema,
  tradelineId: idSchema.nullable().optional(),
  jurisdiction: regulationJurisdictionSchema,
  country: z.string().trim().min(1).default("Canada"),
  provinceOrTerritory: z.string().trim().nullable().optional(),
  regulatorOrStandardBody: z.string().trim().min(1),
  regulationName: z.string().trim().min(1),
  statuteOrRuleName: z.string().trim().min(1),
  sectionNumber: z.string().trim().min(1),
  subsectionNumber: z.string().trim().nullable().optional(),
  regulationTextExcerpt: z.string().trim().min(1),
  citationUrl: z.string().trim().url().nullable().optional().or(z.literal("")),
  citationSource: z.string().trim().min(1),
  citationConfidence: z.coerce.number().min(0).max(1).optional(),
  adminVerifiedCitation: z.boolean().optional(),
  adminNotes: z.string().trim().nullable().optional(),
  mappingStatus: z.enum(["active", "incorrect"]).optional(),
});

export type CorrectionRecord = Selectable<ViolationCorrection>;
export type EvidenceRecord = Selectable<ViolationCorrectionEvidence>;
export type RegulationReferenceRecord = Selectable<ViolationRegulationReference>;
export type TrainingExampleRecord = Selectable<ViolationTrainingExample>;

export type ViolationReviewRunSummary = {
  id: number;
  reportArtifactId: number;
  pass: string;
  status: string;
  channelGuess: string | null;
  channelConfidence: number | null;
  reportDate: Date | null;
  reportCreatedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date | null;
  userId: number | null;
  tradelineCount: number;
  violationCount: number;
  correctionCount: number;
  finalizedCorrectionCount: number;
  needsReviewCount: number;
};

export type ViolationReviewCorrectionDetail = CorrectionRecord & {
  evidence: EvidenceRecord[];
  regulationReferences: RegulationReferenceRecord[];
  trainingExample: TrainingExampleRecord | null;
};

export type OriginalViolationDetail = Selectable<CreditorObligationTest> & {
  creditorName: string | null;
  suggestedRegulationReferences: SuggestedRegulationReference[];
  corrections: ViolationReviewCorrectionDetail[];
};

export type TradelineReviewDetail = Pick<
  Selectable<Tradeline>,
  | "id"
  | "accountNumber"
  | "accountType"
  | "status"
  | "sourceText"
  | "reportArtifactId"
  | "bureauId"
  | "creditorId"
  | "currentBalance"
  | "balance"
  | "openedDate"
  | "lastReportedDate"
> & {
  creditorName: string | null;
  bureauName: string | null;
  violations: OriginalViolationDetail[];
  manualCorrections: ViolationReviewCorrectionDetail[];
};

export type SuggestedRegulationReference = {
  jurisdiction: "federal" | "provincial" | "bureau_standard" | "internal_rule";
  country: string;
  provinceOrTerritory: string | null;
  regulatorOrStandardBody: string;
  regulationName: string;
  statuteOrRuleName: string;
  sectionNumber: string;
  subsectionNumber: string | null;
  regulationTextExcerpt: string;
  citationUrl: string | null;
  citationSource: string;
  citationConfidence: number;
  adminVerifiedCitation: boolean;
  adminNotes: string | null;
  mappingStatus: "active";
};

export type ViolationReviewRunDetail = {
  run: ViolationReviewRunSummary & {
    rawEvidence: Json | null;
    bureauContext: Json | null;
    qualityNotes: Json | null;
  };
  tradelines: TradelineReviewDetail[];
};
