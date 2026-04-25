import { z } from "zod";



export const schema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  columns: z.array(
    z.object({
      header: z.string(),
      dataKey: z.string(),
      width: z.union([z.string(), z.number()]).optional(),
    })
  ),
  data: z.array(z.record(z.string(), z.any())),
  footerText: z.string().optional(),
  orientation: z.enum(["portrait", "landscape"]).optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  pdf: string;
};

export const postReportPdf = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/pdf/report`, {
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