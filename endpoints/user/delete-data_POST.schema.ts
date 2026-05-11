import { z } from "zod";

import {
  USER_DATA_DELETION_CATEGORIES,
  type UserDataDeletionCategory,
  type UserDataDeletionResult,
} from "../../helpers/userDataDeletionTypes";

export const schema = z.object({
  categories: z
    .array(z.enum(USER_DATA_DELETION_CATEGORIES))
    .min(1, "Choose at least one data category to delete"),
  confirm: z.literal(true, {
    errorMap: () => ({ message: "Confirm that you want to permanently delete the selected data" }),
  }),
});

export type InputType = z.infer<typeof schema> & {
  categories: UserDataDeletionCategory[];
};

export type OutputType = UserDataDeletionResult;

export const postDeleteUserData = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/user/delete-data`, {
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
