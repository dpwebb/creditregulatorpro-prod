import { z } from "zod";

import { Selectable } from "kysely";
import { ObligationInstance } from "../../helpers/schema";

export const schema = z.object({
  obligationInstanceId: z.number(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  newObligationInstance: Selectable<ObligationInstance>;
  fcacPacketId?: number | null;
  provincialPacketId?: number | null;
};

export const triggerEscalation = async (body: InputType, init?: RequestInit): Promise<OutputType> => {
  const result = await fetch(`/_api/escalation/trigger`, {
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