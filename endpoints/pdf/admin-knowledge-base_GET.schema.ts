import { z } from "zod";

export const schema = z.object({});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  pdf: string;
};

export const getAdminKnowledgeBasePdf = async (init?: RequestInit): Promise<OutputType> => {
  const result = await fetch(`/_api/pdf/admin-knowledge-base`, {
    method: "GET",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!result.ok) {
    let errorMessage = "Failed to fetch PDF";
    try {
      const errorObject = JSON.parse(await result.text());
      errorMessage = errorObject.error || errorMessage;
    } catch {
      // Fallback if not JSON
    }
    throw new Error(errorMessage);
  }

  return JSON.parse(await result.text());
};