import { z } from "zod";

import { ChallengeAccessPoint } from "../../helpers/challengeAccessPointGenerator";

export const schema = z.object({
  artifactId: z.number(),
});

export type InputType = z.infer<typeof schema>;

export type TopFinding = {
  id: number;
  tradelineId: number;
  severity: "HIGH" | "MEDIUM" | "LOW" | string;
  creditorName: string;
  violationCategory: string;
  accountNumber: string;
  bureauName: string;
};

export type CrossReferenceChange = {
  field: string;
  oldValue: string | null;
  newValue: string | null;
};

export type DisputeActivity = {
  packetId: number;
  packetType: string | null;
  sentDate: string | null;
  status: string | null;
};

export type CrossReferenceMatchedTradeline = {
  tradelineId: number;
  creditorName: string;
  changes: CrossReferenceChange[];
  disputeActivity?: DisputeActivity[];
};

export type CrossReferenceTradelineSummary = {
  tradelineId: number;
  creditorName: string;
  currentBalance: string | null;
  status: string | null;
  disputeActivity?: DisputeActivity[];
};

export type DisputeOutcomeSummary = {
  removedAfterDispute: number;
  unchangedAfterDispute: number;
  changedAfterDispute: number;
  removedUnexplained: number;
  totalDisputesSent: number;
};

export type CrossReference = {
  previousArtifactId: number;
  previousFileName: string;
  previousUploadDate: string;
  matched: CrossReferenceMatchedTradeline[];
  added: CrossReferenceTradelineSummary[];
  removed: CrossReferenceTradelineSummary[];
};

export type OutputType = {
  metadata: {
    fileName: string;
    uploadDate: Date;
    region: string;
    bureauName: string;
  };
  stats: {
    totalTradelines: number;
    highSeverity: number;
    mediumSeverity: number;
    lowSeverity: number;
    bureauViolations: number;
    creditorViolations: number;
    collectorViolations: number;
    actionableCount: number;
    threatScore: number;
    equifaxViolations: number;
    transunionViolations: number;
  };
  topFindings: TopFinding[];
  challengeAccessPoints: ChallengeAccessPoint[];
  crossReference?: CrossReference;
  disputeOutcomeSummary?: DisputeOutcomeSummary;
};

export const getUploadResults = async (
  input: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const { artifactId } = input;
  const result = await fetch(`/_api/upload-results/get?artifactId=${artifactId}`, {
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