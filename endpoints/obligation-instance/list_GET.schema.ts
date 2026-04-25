import { z } from "zod";

import { ObligationStateArrayValues } from "../../helpers/schema";

export const schema = z.object({
  tradelineId: z.number().optional(),
  state: z.enum(ObligationStateArrayValues).optional(),
  disputeVector: z.string().optional(),
  limit: z.coerce.number().min(1).optional(),
  offset: z.coerce.number().min(0).optional(),
});

export type InputType = z.infer<typeof schema>;

export type ObligationInstanceListItem = {
  id: number;
  disputeVector: string | null;
  state: string | null;
  createdAt: Date | null;
  challengeSentDate: Date | null;
  responseDeadline: Date | null;
  tradelineId: number | null;
  accountNumber: string;
  creditorName: string | null;
  bureauName: string | null;
};

export type OutputType = {
  instances: ObligationInstanceListItem[];
  total: number;
};

export const getObligationInstanceList = async (params?: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = params ? schema.parse(params) : {};

  const searchParams = new URLSearchParams();
  if (validatedInput.tradelineId !== undefined) searchParams.append('tradelineId', validatedInput.tradelineId.toString());
  if (validatedInput.state) searchParams.append('state', validatedInput.state);
  if (validatedInput.disputeVector) searchParams.append('disputeVector', validatedInput.disputeVector);
  if (validatedInput.limit !== undefined) searchParams.append('limit', validatedInput.limit.toString());
  if (validatedInput.offset !== undefined) searchParams.append('offset', validatedInput.offset.toString());

  const queryString = searchParams.toString() ? `?${searchParams.toString()}` : '';

  const result = await fetch(`/_api/obligation-instance/list${queryString}`, {
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