import { z } from "zod";



const analyticsMetricSchema = z.object({
  label: z.string(),
  total: z.number(),
  successful: z.number(),
  successRate: z.number(),
});

export const schema = z.object({
  title: z.string().optional(),
  data: z.object({
    overall: z.object({
      totalDisputes: z.number(),
      totalSuccess: z.number(),
      successRate: z.number(),
      activeDisputes: z.number(),
      averageResolutionTimeDays: z.number(),
      escalationRate: z.number(),
      exhaustionRate: z.number(),
    }),
    byVector: z.array(analyticsMetricSchema),
    byViolation: z.array(analyticsMetricSchema),
    byCreditor: z.array(analyticsMetricSchema),
    byBureau: z.array(analyticsMetricSchema),
  }),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  pdf: string;
};

export const postAnalyticsReportPdf = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/pdf/analytics-report`, {
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