import { z } from "zod";


export const schema = z.object({});

export type InputType = z.infer<typeof schema>;

export type BureauDisputeContact = {
  id: number;
  name: string;
  disputeAddress: {
    name: string;
    department: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    province: string;
    postalCode: string;
    email: string | null;
    onlineDisputeUrl: string;
  } | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

export type OutputType = {
  bureaus: BureauDisputeContact[];
};

export const getBureauDisputeContacts = async (init?: RequestInit): Promise<OutputType> => {
  const result = await fetch(`/_api/bureau/dispute-contacts`, {
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