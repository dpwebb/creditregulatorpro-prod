import { z } from "zod";
import superjson from "superjson";
import { ComprehensiveParseResult } from "../../helpers/reportParserTypes";

export const schema = z.object({
  html: z.string().min(1),
  bureau: z.string().optional(),
  mappingIds: z.array(z.number()).optional(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  diagnosticOnly: true;
  authoritative: false;
  canonical: false;
  sourceStage: "PARSER_MAPPING_DIAGNOSTIC";
  defaultResult: ComprehensiveParseResult;
  overriddenResult: ComprehensiveParseResult;
  detectedBureau: string;
};

export const testParserMapping = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/parser-mapping/test`, {
    method: "POST",
    body: superjson.stringify(body),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!result.ok) {
    const errorObject = superjson.parse<{ error: string }>(await result.text());
    throw new Error(errorObject.error);
  }

  return superjson.parse<OutputType>(await result.text());
};
