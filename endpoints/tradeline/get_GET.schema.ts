import { z } from "zod";

import { Selectable } from "kysely";
import { Tradeline } from "../../helpers/schema";

export const schema = z.object({
  id: z.coerce.number()
});

export type InputType = z.infer<typeof schema>;

export type LinkedDisputeStatus = 'none' | 'created' | 'sent';

export type RelatedCollectionTradeline = {
  id: number;
  accountNumber: string;
  collectionAgencyName: string | null;
  creditorName: string | null;
  balance: string | number | null;
  dateAssignedToCollection: Date | null;
  status: string | null;
  linkedDisputeStatus: LinkedDisputeStatus;
};

export type CrossBureauTradeline = {
  id: number;
  bureauId: number | null;
  bureauName: string | null;
  creditorName: string | null;
  accountNumber: string;
  disputeStatus: string | null;
  balance: string | number | null;
  currentBalance: string | number | null;
  status: string | null;
  openedDate: Date | null;
  dateClosed: Date | null;
  dateOfFirstDelinquency: Date | null;
  creditLimit: string | number | null;
  highCredit: string | number | null;
  amountPastDue: string | number | null;
  lastActivityDate: Date | null;
};

export type TradelineWithDetails = Selectable<Tradeline> & {
  bureauName: string | null;
  creditorName: string | null;
  tuCaseId: string | null;
  firstReportedDate: string | null;
  lastReviewedBy: string | null;
  lastReviewedDate: string | null;
  relatedCollectionTradelines: RelatedCollectionTradeline[];
  crossBureauTradeline: CrossBureauTradeline | null;
};

export type OutputType = {
  tradeline: TradelineWithDetails;
};

export const getTradeline = async (params: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(params);
  const result = await fetch(`/_api/tradeline/get?id=${validatedInput.id}`, {
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