import { z } from "zod";


export const schema = z.object({});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  fullName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  dateOfBirth: Date | null;
  phone: string | null;
  email: string;
};

export const getUserProfile = async (
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/user/profile`, {
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