import type { ConsumerIdentificationMetadata } from "../../helpers/consumerIdentification";

export type OutputType = {
  identification: ConsumerIdentificationMetadata | null;
};

export const getConsumerIdentification = async (
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/user/identification`, {
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
