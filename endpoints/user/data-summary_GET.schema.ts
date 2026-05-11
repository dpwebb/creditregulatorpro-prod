import type { UserDataSummary } from "../../helpers/userDataDeletionTypes";

export type OutputType = UserDataSummary;

export const getUserDataSummary = async (
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/user/data-summary`, {
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
