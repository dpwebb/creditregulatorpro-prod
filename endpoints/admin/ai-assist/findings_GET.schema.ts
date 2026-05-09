import { z } from "zod";

export const schema = z.object({
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export type InputType = z.infer<typeof schema>;

export type AdminAiAssistFindingLookupEntry = {
  id: number;
  tradelineId: number | null;
  userId: number | null;
  userEmail: string | null;
  userDisplayName: string | null;
  creditorName: string | null;
  bureauName: string | null;
  accountType: string | null;
  accountNumberMasked: string | null;
  violationCategory: string | null;
  displayLabel: string;
  userStatus: string | null;
  detectedAt: string | null;
};

export type OutputType = {
  findings: AdminAiAssistFindingLookupEntry[];
  total: number;
};

export const getAdminAiAssistFindings = async (
  params: Partial<InputType> = {},
  init?: RequestInit,
): Promise<OutputType> => {
  const searchParams = new URLSearchParams();
  if (params.q) searchParams.append("q", params.q);
  if (params.limit) searchParams.append("limit", params.limit.toString());
  if (params.offset) searchParams.append("offset", params.offset.toString());

  const result = await fetch(`/_api/admin/ai-assist/findings?${searchParams.toString()}`, {
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

  return JSON.parse(await result.text()) as OutputType;
};
