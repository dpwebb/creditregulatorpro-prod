import { z } from "zod";


export const schema = z.object({});

export type InputType = z.infer<typeof schema>;

export type ComplianceEvent = {
  id: number;
  packetId: number;
  eventType: "PACKET_SENT" | "RESPONSE_DUE" | "RESPONSE_RECEIVED" | "OVERDUE";
  date: Date;
  title: string;
  description: string;
  accountNumber: string;
  bureauName: string;
  complianceStatus: "ON_TIME" | "OVERDUE" | "RESPONDED" | "PENDING_SEND";
  daysOverdue: number | null;
  statuteCode: string | null;
  timeframeDays: number | null;
};

export type ComplianceStats = {
  totalSent: number;
  awaitingResponse: number;
  overdue: number;
  responded: number;
  pendingSend: number;
};

export type OutputType = {
  events: ComplianceEvent[];
  stats: ComplianceStats;
};

export const getComplianceCalendar = async (
  body: InputType = {},
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/packet/compliance-calendar`, {
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