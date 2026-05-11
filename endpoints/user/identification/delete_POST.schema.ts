export type OutputType = {
  deleted: boolean;
};

export const postDeleteConsumerIdentification = async (
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/user/identification/delete`, {
    method: "POST",
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
