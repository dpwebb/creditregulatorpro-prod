import { z } from "zod";

import { Selectable } from "kysely";
import { ReportArtifact } from "../../helpers/schema";

export const REPORT_ARTIFACT_LIST_DEFAULT_LIMIT = 50;
export const REPORT_ARTIFACT_LIST_MAX_LIMIT = 100;

export const schema = z.object({
  limit: z.coerce.number().int().min(1).max(REPORT_ARTIFACT_LIST_MAX_LIMIT).default(REPORT_ARTIFACT_LIST_DEFAULT_LIMIT),
  offset: z.coerce.number().min(0).optional(),
});

export type InputType = z.infer<typeof schema>;

export type ReportArtifactListItem = Pick<
  Selectable<ReportArtifact>,
  | "id"
  | "artifactType"
  | "reportDate"
  | "metro2Version"
  | "sha256"
  | "createdAt"
  | "userId"
  | "organizationId"
  | "region"
  | "tradelineId"
  | "crrgYear"
  | "expiresAt"
  | "validationRulesApplied"
  | "processingStatus"
>;

export type ReportArtifactWithDetails = ReportArtifactListItem & {
  fileName: string | null;
  tradelineAccountNumber: string | null;
  tradelineAccountType: string | null;
  linkedAccountCount: number | null;
  bureauName: string | null;
};

export type OutputType = {
  artifacts: ReportArtifactWithDetails[];
  total: number;
};

export const getReportArtifactList = async (params?: InputType, init?: RequestInit): Promise<OutputType> => {
  const searchParams = new URLSearchParams();
  if (params?.limit !== undefined) searchParams.set("limit", params.limit.toString());
  if (params?.offset !== undefined) searchParams.set("offset", params.offset.toString());
  const queryString = searchParams.toString() ? `?${searchParams.toString()}` : '';

  const result = await fetch(`/_api/report-artifact/list${queryString}`, {
    method: "GET",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!result.ok) {
    const errorObject = JSON.parse(await result.text());
    throw new Error(errorObject.error);
  }
  return JSON.parse(await result.text());
};
