import { z } from "zod";


const TradelineSchema = z.object({
  accountNumber: z.string().optional().default("Not reported"),
  creditorName: z.string(),
  accountType: z.string(),
  balance: z.number(),
  status: z.string(),
  dates: z.object({
    opened: z.coerce.date().nullable().optional(),
    reported: z.coerce.date().nullable().optional(),
    closed: z.coerce.date().nullable().optional(),
    dofd: z.coerce.date().nullable().optional(),
  }).passthrough(),
  amounts: z.object({
    high: z.number().optional(),
    pastDue: z.number().optional(),
  }).passthrough(),
  remarkCodes: z.array(z.string()),
});

export const schema = z.object({
  reviewSessionId: z.string().uuid(),
  region: z.string().length(2),
  fileName: z.string(),
  mimeType: z.string(),
  bytesBase64: z.string(),
  tradelines: z.array(TradelineSchema),
}).strict();

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  ok: boolean;
  storageUrl: string;
  tradelineIds: number[];
};

export const postApprove = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/review/approve`, {
    method: "POST",
    body: JSON.stringify(validatedInput),
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
