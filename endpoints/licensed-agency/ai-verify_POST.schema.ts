import { z } from "zod";


export const schema = z.object({
  agencyName: z.string().min(1),
  province: z.string().length(2),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  confidence: number;
  analysis: string;
  isLikelyLicensed: boolean;
};

export const postLicensedAgencyAiVerify = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/licensed-agency/ai-verify`, {
    method: "POST",
    body: JSON.stringify(body),
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