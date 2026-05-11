import { z } from "zod";
import {
  RegulationChangeClassificationArrayValues,
  RegulationUpdateCandidateStatusArrayValues,
  type RegulationCategory,
  type RegulationChangeClassification,
  type RegulationUpdateCandidateStatus,
} from "../../helpers/schema";

export const schema = z.object({
  status: z.enum(RegulationUpdateCandidateStatusArrayValues).optional(),
  changeClassification: z.enum(RegulationChangeClassificationArrayValues).optional(),
  jurisdiction: z.string().optional(),
});

export type InputType = z.infer<typeof schema>;

export type RegulationCandidateRow = {
  id: number;
  candidateRegulationId: string;
  existingRegulationRecordId: number | null;
  sourceScanId: number | null;
  changeClassification: RegulationChangeClassification;
  status: RegulationUpdateCandidateStatus;
  jurisdiction: string;
  authoritySource: string;
  regulationTitle: string;
  sectionNumber: string;
  subsection: string | null;
  shortTitle: string;
  fullText: string;
  plainLanguageSummary: string;
  officialSourceUrl: string;
  publicationDate: Date | null;
  effectiveDate: Date | null;
  repealSupersededStatus: string;
  regulationCategory: RegulationCategory;
  tags: string[];
  parserSafeNormalizedText: string;
  citationFormat: string;
  proposedVersion: number;
  normalizedTextHash: string;
  confidenceScore: string | number;
  diffReport: unknown;
  confidenceReasons: string[];
  ambiguityReasons: string[];
  duplicateCandidateIds: number[];
  sourceDocumentUrl: string | null;
  detectedAt: Date;
  reviewedAt: Date | null;
  reviewedBy: number | null;
  reviewNotes: string | null;
  createdRegulationRecordId: number | null;
};

export type OutputType = {
  candidates: RegulationCandidateRow[];
};

export const getRegulationCandidates = async (filters?: InputType, init?: RequestInit): Promise<OutputType> => {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.changeClassification) params.set("changeClassification", filters.changeClassification);
  if (filters?.jurisdiction) params.set("jurisdiction", filters.jurisdiction);
  const result = await fetch(`/_api/regulation-registry/candidates${params.toString() ? `?${params}` : ""}`, {
    method: "GET",
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
