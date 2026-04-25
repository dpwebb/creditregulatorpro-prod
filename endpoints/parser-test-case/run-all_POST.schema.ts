import { z } from "zod";


export const schema = z.object({});

export type OutputType = {
  total: number;
  passed: number;
  failed: number;
  failures: {
    id: number;
    name: string;
    reason: string;
  }[];
};

export const runAllParserTests = async (
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/parser-test-case/run-all`, {
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