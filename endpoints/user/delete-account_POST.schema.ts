import { z } from "zod";

import type { UserDataDeletionResult } from "../../helpers/userDataDeletionTypes";

export const ACCOUNT_DELETE_CONFIRM_PHRASE = "DELETE MY ACCOUNT";

export const schema = z.object({
  confirmEmail: z.string().email("Enter your account email to confirm deletion"),
  confirmPhrase: z.literal(ACCOUNT_DELETE_CONFIRM_PHRASE, {
    errorMap: () => ({ message: `Type ${ACCOUNT_DELETE_CONFIRM_PHRASE} to confirm account deletion` }),
  }),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = UserDataDeletionResult;

export const postDeleteUserAccount = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/user/delete-account`, {
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
