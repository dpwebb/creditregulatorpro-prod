import { z } from "zod";

import { Selectable } from "kysely";
import { ObligationChallengeLog } from "../../helpers/schema";

export const schema = z.object({
  tradelineId: z.number().optional(),
});

export type InputType = z.infer<typeof schema>;

export type DriftLogWithArtifact = Pick<Selectable<ObligationChallengeLog>, 
  "id" | "fieldName" | "expectedValue" | "actualValue" | "severity" | "message" | "detectedAt" | "timingDriftDays" | "tradelineId" | "packetId" | "sourceSnapshotId" | "comparisonSnapshotId"
> & {
  reportDate: Date | null;
  artifactType: string | null;
  accountNumber: string | null;
  creditorName: string | null;
};

export type OutputType = {
  logs: DriftLogWithArtifact[];
};

export const getTradelineDriftLogs = async (params: InputType, init?: RequestInit): Promise<OutputType> => {
  const queryString = params.tradelineId ? `?tradelineId=${params.tradelineId}` : '';
  const result = await fetch(`/_api/tradeline/drift-logs${queryString}`, {
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