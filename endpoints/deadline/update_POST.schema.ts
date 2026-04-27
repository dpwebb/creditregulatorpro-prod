import { z } from "zod";

import { Selectable } from "kysely";
import { DeadlineEvent } from "../../helpers/schema";

export const schema = z.object({
  deadlineEventId: z.number(),
  title: z.string().optional(),
  description: z.string().optional(),
  deadline: z.coerce.date().optional(),
  eventType: z.string().optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  deadlineEvent: Selectable<DeadlineEvent>;
};

export const postDeadlineUpdate = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/deadline/update`, {
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