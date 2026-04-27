import { z } from "zod";


export const schema = z.object({
  source: z.enum(["ontario_open_data", "manual"]),
  agencies: z
    .array(
      z.object({
        agencyName: z.string(),
        province: z.string().length(2),
        licenseNumber: z.string().optional().nullable(),
        licenseStatus: z.string().optional(),
      })
    )
    .optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  imported: number;
  skipped: number;
};

export const postLicensedAgencyImport = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/licensed-agency/import`, {
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