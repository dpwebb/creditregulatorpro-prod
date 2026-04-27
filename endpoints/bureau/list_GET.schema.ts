import { z } from "zod";

import { Selectable } from "kysely";
import { Bureau } from "../../helpers/schema";

export const schema = z.object({});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  bureaus: Selectable<Bureau>[];
};

export const getBureauList = async (init?: RequestInit): Promise<OutputType> => {
  const result = await fetch(`/_api/bureau/list`, {
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