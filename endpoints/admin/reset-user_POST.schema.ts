import { z } from "zod";

export const schema = z.object({
  userId: z.coerce.number().int().positive(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  success: boolean;
  deletedReportArtifacts: number;
  deletedTradelines: number;
  deletedPackets: number;
  deletedObligationInstances: number;
  deletedBankruptcyRecords: number;
  deletedPostalTransactions: number;
  deletedFreezeRecords: number;
  userEmail: string;
};

export const postAdminResetUser = async (
  body: z.infer<typeof schema>,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/admin/reset-user`, {
    method: "POST",
    body: JSON.stringify(validatedInput),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!result.ok) {
    const errorObject = JSON.parse(await result.text()) as { error: string };
    throw new Error(errorObject.error);
  }

  return JSON.parse(await result.text()) as OutputType;
};
