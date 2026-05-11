import { z } from "zod";

export const schema = z.object({});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  inserted: number;
  skipped: number;
  errors: string[];
  candidateIds: number[];
};
