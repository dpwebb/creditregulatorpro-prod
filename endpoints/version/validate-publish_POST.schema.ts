import { z } from "zod";


export const CheckItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(["pass", "fail", "warning"]),
  message: z.string(),
  required: z.boolean(),
});

export const schema = z.object({
  versionId: z.number()
});

export type InputType = z.infer<typeof schema>;
export type CheckItem = z.infer<typeof CheckItemSchema>;
export type OutputType = {
  checks: CheckItem[],
  canRelease: boolean
};

export const postValidatePublish = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const result = await fetch(`/_api/version/validate-publish`, {
    method: "POST",
    body: JSON.stringify(schema.parse(body)),
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