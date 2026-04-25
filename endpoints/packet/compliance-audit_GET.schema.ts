import { z } from "zod";

import { Selectable } from "kysely";
import { 
  PacketComplianceAudit, 
  Packet, 
  Obligation, 
  StatuteVersion, 
  EvidenceEvent, 
  Tradeline,
  Statute
} from "../../helpers/schema";

export const schema = z.object({
  packetId: z.coerce.number().optional(),
  tradelineId: z.coerce.number().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  limit: z.coerce.number().min(1).max(1000).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export type InputType = z.infer<typeof schema>;

// Define the joined output shape
export type ComplianceAuditWithDetails = {
  // Audit fields
  id: number;
  complianceStatus: string;
  regulationType: string | null;
  selectionReason: string | null;
  appliedAt: Date | null;
  region: string | null;
  
  // Packet fields
  packetId: number;
  packetStatus: string | null;
  packetTerminalLabel: string | null;
  packetCreatedAt: Date | null;
  
  // Tradeline fields
  tradelineAccountNumber: string | null;
  
  // Obligation fields
  obligationDescription: string | null;
  obligationSection: string | null;
  obligationJurisdiction: string | null;
  obligationStatutoryReference: string | null;
  obligationType: string | null;
  obligationTimeframeDays: number | null;
  
  // Statute fields
  statuteCode: string | null;
  statuteVersion: number | null;
  statuteEffectiveDate: Date | null;
  statuteSectionReference: string | null;
  statuteSourceUrl: string | null;
  
  // Evidence Event fields
  evidenceCurrentHash: string | null;
  evidenceEventType: string | null;
  evidenceAt: Date | null;
};

export type OutputType = {
  audits: ComplianceAuditWithDetails[];
  total: number;
};

export const getComplianceAudits = async (params: InputType = { limit: 50, offset: 0 }, init?: RequestInit): Promise<OutputType> => {
  const url = new URL(`/_api/packet/compliance-audit`, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  
  if (params.packetId !== undefined) url.searchParams.append('packetId', params.packetId.toString());
  if (params.tradelineId !== undefined) url.searchParams.append('tradelineId', params.tradelineId.toString());
  if (params.startDate !== undefined) url.searchParams.append('startDate', params.startDate.toISOString());
  if (params.endDate !== undefined) url.searchParams.append('endDate', params.endDate.toISOString());
  if (params.limit !== undefined) url.searchParams.append('limit', params.limit.toString());
  if (params.offset !== undefined) url.searchParams.append('offset', params.offset.toString());
  
  const result = await fetch(url.toString(), {
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