import { z } from "zod";
import {
  RegulationActiveStatusArrayValues,
  RegulationCategoryArrayValues,
  RegulationReviewStatusArrayValues,
  type RegulationActiveStatus,
  type RegulationCategory,
  type RegulationReviewStatus,
} from "../../helpers/schema";

export const schema = z.object({
  search: z.string().optional(),
  jurisdiction: z.string().optional(),
  category: z.enum(RegulationCategoryArrayValues).optional(),
  activeStatus: z.enum(RegulationActiveStatusArrayValues).optional(),
  reviewStatus: z.enum(RegulationReviewStatusArrayValues).optional(),
  includeInactive: z.coerce.boolean().optional(),
});

export type InputType = z.infer<typeof schema>;

export type RegulationRegistryRow = {
  id: number;
  regulationId: string;
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
  updateVersion: number;
  activeStatus: RegulationActiveStatus;
  reviewStatus: RegulationReviewStatus;
  confidenceScore: string | number;
  sourceContentHash: string;
  sourceDocumentUrl: string | null;
  supersedesRecordId: number | null;
  supersededByRecordId: number | null;
  approvalNotes: string | null;
  approvedBy: number | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  mappingCount: number;
  mappedViolationCategories: string[];
};

export type OutputType = {
  regulations: RegulationRegistryRow[];
};

export const getRegulationRegistryList = async (filters?: InputType, init?: RequestInit): Promise<OutputType> => {
  const params = new URLSearchParams();
  if (filters?.search) params.set("search", filters.search);
  if (filters?.jurisdiction) params.set("jurisdiction", filters.jurisdiction);
  if (filters?.category) params.set("category", filters.category);
  if (filters?.activeStatus) params.set("activeStatus", filters.activeStatus);
  if (filters?.reviewStatus) params.set("reviewStatus", filters.reviewStatus);
  if (filters?.includeInactive) params.set("includeInactive", "true");

  const result = await fetch(`/_api/regulation-registry/list${params.toString() ? `?${params}` : ""}`, {
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
