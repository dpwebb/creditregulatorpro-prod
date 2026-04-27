import { z } from "zod";

export const schema = z.object({});

export type InputType = z.infer<typeof schema>;

export type ChangeSummaryItem = {
  /**
   * For audit-log-based items: an AuditEntityType value (e.g. "BUREAU", "STATUTE").
   * For snapshot diff-based items: the diff category suffixed with "_DIFF" (e.g. "STATUTES_DIFF", "FEATURE_FLAGS_DIFF").
   */
  entityType: string;
  /**
   * For audit-log-based items: an AuditActionType value (e.g. "CREATE", "UPDATE").
   * For snapshot diff-based items: "DIFF_ADDED", "DIFF_REMOVED", or "DIFF_CHANGED".
   */
  actionType: string;
  count: number;
  level: 'MAJOR' | 'MINOR' | 'PATCH';
};

export type ChangeSummaryOutput = {
  changes: ChangeSummaryItem[];
  highestLevel: 'MAJOR' | 'MINOR' | 'PATCH' | 'none';
  suggestedVersion: string;
  lastReleasedVersion: string | null;
  totalOperations: number;
};

export const getChangeSummary = async (init?: RequestInit): Promise<ChangeSummaryOutput> => {
  const result = await fetch(`/_api/version/change-summary`, {
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