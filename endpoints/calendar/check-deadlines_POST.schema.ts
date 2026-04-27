import { z } from "zod";

export const schema = z.object({
  // Optional filters could be added here in the future
});

export type InputType = z.infer<typeof schema>;

export type OverdueItem = {
  id: number;
  title: string;
  jurisdiction: string;
  type: "EFFECTIVE_DATE_OVERDUE" | "REVIEW_OVERDUE";
  dueDate: string;
  daysOverdue: number;
  status: string;
};

export type OutputType = {
  criticalCount: number;
  overdueItems: OverdueItem[];
  checkedAt: string;
};

export const postCheckDeadlines = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/calendar/check-deadlines`, {
    method: "POST",
    body: JSON.stringify(validatedInput),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!result.ok) {
    const errorObject = await result.json() as { error: string };
    throw new Error(errorObject.error);
  }
  return result.json() as Promise<OutputType>;
};