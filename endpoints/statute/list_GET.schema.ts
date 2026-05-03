import { z } from "zod";
import { readStatuteRequestError } from "./requestError";

export const schema = z.object({
  jurisdiction: z.string().optional(),
  code: z.string().optional(),
  status: z.enum(["ACTIVE", "AMENDED", "REPEALED"]).optional(),
  topic: z.string().optional(),
  citation: z.string().optional(),
  includeSuperseded: z.boolean().optional().default(false),
  searchText: z.string().optional(),
});

export type InputType = z.infer<typeof schema>;

// Combined data from statute and statute_version tables
export type OutputType = {
  statutes: {
    id: number; // statute.id
    jurisdiction: string;
    code: string;
    versionId: number; // statute_version.id
    version: number;
    description: string | null;
    effectiveDate: Date | null;
    supersededDate: Date | null;
    responseClockDays: number | null;
    sourceUrl: string | null;
    sectionReference: string | null;
    createdAt: Date | null;
    packetCount: number;
    obligationCount: number;
    lifecycleStatus: "ACTIVE" | "AMENDED" | "REPEALED";
    topic: string;
    citation: string;
    lastReviewedAt: Date | null;
  }[];
};

export const getStatuteList = async (filters?: InputType, init?: RequestInit): Promise<OutputType> => {
  // Convert filters to URL search params
  const params = new URLSearchParams();
  if (filters?.jurisdiction) params.append("jurisdiction", filters.jurisdiction);
  if (filters?.code) params.append("code", filters.code);
  if (filters?.status) params.append("status", filters.status);
  if (filters?.topic) params.append("topic", filters.topic);
  if (filters?.citation) params.append("citation", filters.citation);
  if (filters?.includeSuperseded) params.append("includeSuperseded", "true");
  if (filters?.searchText) params.append("searchText", filters.searchText);

  const queryString = params.toString();
  const url = `/_api/statute/list${queryString ? `?${queryString}` : ""}`;

  const result = await fetch(url, {
    method: "GET",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!result.ok) {
    throw new Error(await readStatuteRequestError(result));
  }
  return JSON.parse(await result.text());
};
