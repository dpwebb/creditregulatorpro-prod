import { z } from "zod";

export const schema = z.object({
  artifactId: z.string().min(1),
});

export type InputType = z.infer<typeof schema>;

// Output is HTML string, so we don't strictly need a Zod schema for output
// but we can define the type for client usage if needed (though this is a page load)
export type OutputType = string;

// This is a page endpoint, usually accessed via browser navigation, 
// but we can provide a helper if we ever need to fetch the HTML programmatically.
export const getReviewPage = async (
  params: InputType,
  init?: RequestInit
): Promise<string> => {
  const queryString = new URLSearchParams(params).toString();
  const result = await fetch(`/_api/cases/review?${queryString}`, {
    method: "GET",
    ...init,
    headers: {
      ...(init?.headers ?? {}),
    },
  });
  
  if (!result.ok) {
    throw new Error(`Request failed with status ${result.status}`);
  }
  
  return result.text();
};