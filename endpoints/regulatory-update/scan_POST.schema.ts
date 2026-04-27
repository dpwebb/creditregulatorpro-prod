import { z } from "zod";
import { RegulatoryChangeType, RegulatoryUpdateSource } from "../../helpers/schema";

export const schema = z.object({});

export type InputType = z.infer<typeof schema>;

export type ScannedUpdateOutput = {
  title: string;
  description: string;
  jurisdiction: string;
  changeType: RegulatoryChangeType;
  source: RegulatoryUpdateSource;
  statutoryReference: string | null;
  effectiveDate: string | null;
  sourceUrl: string | null;
  impactAssessment: string | null;
  actionRequired: string | null;
};

export type OutputType = {
  inserted: number;
  scanned: ScannedUpdateOutput[];
};

export const postRegulatoryUpdateScan = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const result = await fetch(`/_api/regulatory-update/scan`, {
    method: "POST",
    body: JSON.stringify(body),
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