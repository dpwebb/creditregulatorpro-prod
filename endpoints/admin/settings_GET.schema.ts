import { z } from "zod";

import { Selectable } from "kysely";
import { SystemSettings } from "../../helpers/schema";

export const schema = z.object({});

export type InputType = z.infer<typeof schema>;

export type OutputType = Selectable<SystemSettings>[];

export const getSystemSettings = async (
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/admin/settings`, {
    method: "GET",
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