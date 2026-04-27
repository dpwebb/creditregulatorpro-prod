import { z } from "zod";

import { Selectable } from "kysely";
import { Packet } from "../../helpers/schema";

export const schema = z.object({});

export type InputType = z.infer<typeof schema>;

export type PacketWithDetails = Pick<Selectable<Packet>, 
  | 'id'
  | 'type'
  | 'content'
  | 'region'
  | 'status'
  | 'createdAt'
  | 'tradelineId'
  | 'organizationId'
  | 'statuteVersionId'
  | 'signatureMode'
  | 'letterDate'
  | 'sentDate'
  | 'deliveryMethod'
  | 'trackingNumber'
  | 'responseType'
  | 'bureauResponseDate'
  | 'consumerCertification'
  | 'successOutcome'
  | 'terminalLabel'
> & {
  tradelineAccountNumber: string | null;
  creditorName: string | null;
  originalCreditorName: string | null;
  userName: string | null;
  userEmail: string | null;
  userFullName: string | null;
  userId: number | null;
};

export type TrendData = {
  value: number;
  isPositive: boolean;
};

export type OutputType = {
  totalBureaus: number;
  totalTradelines: number;
  totalObligations: number;
  totalPackets: number;
  totalReportArtifacts: number;
  packetsSentCount: number;
  violationsFoundCount: number;
  recentPackets: PacketWithDetails[];
  trends: {
    tradelines: TrendData;
    obligations: TrendData;
    packets: TrendData;
  };
  progress: {
    overallCompletion: number;
    successRate: number;
    responseRate: number;
  };
};

export const getDashboardStats = async (init?: RequestInit): Promise<OutputType> => {
  const result = await fetch(`/_api/dashboard/stats`, {
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