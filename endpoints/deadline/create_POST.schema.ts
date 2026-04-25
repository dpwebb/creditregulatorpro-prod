import { z } from "zod";

import { Selectable } from "kysely";
import { DeadlineEvent } from "../../helpers/schema";

export const schema = z.object({
  obligationInstanceId: z.number().optional(),
  packetId: z.number().optional(),
  eventType: z.string().min(1, "Event type is required"),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  deadline: z.coerce.date().optional(),
  challengeSentDate: z.coerce.date().optional(), // Used for auto-calculation if deadline not provided
}).refine(data => data.deadline || data.challengeSentDate, {
  message: "Either deadline or challengeSentDate must be provided",
  path: ["deadline"],
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  deadlineEvent: Selectable<DeadlineEvent>;
};

export const postDeadlineCreate = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/deadline/create`, {
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