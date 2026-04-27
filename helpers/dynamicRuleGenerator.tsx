import { z } from "zod";
import { ViolationCategoryArrayValues } from "./schema";

export const RuleConditionSchema = z.object({
  field: z.string(),
  operator: z.enum([
    "equals",
    "notEquals",
    "contains",
    "greaterThan",
    "lessThan",
    "isNull",
    "isNotNull",
    "olderThanDays",
    "newerThanDays",
    "matchesPattern",
  ]),
  value: z.any().optional(),
});

export const RuleDefinitionSchema = z.object({
  conditions: z.array(RuleConditionSchema),
  logic: z.enum(["AND", "OR"]),
});

export const GeneratedRuleSchema = z.object({
  title: z.string(),
  description: z.string(),
  ruleDefinition: RuleDefinitionSchema,
  violationCategory: z.enum(ViolationCategoryArrayValues),
  severity: z.enum(["HIGH", "MEDIUM", "LOW"]),
  confidenceScore: z.number().min(0).max(1),
  userExplanationTemplate: z.string(),
  recommendedActionTemplate: z.string(),
  statutoryBasis: z.string(),
});

export type GeneratedRule = z.infer<typeof GeneratedRuleSchema>;

export interface RegulatoryUpdateInput {
  title: string;
  description: string;
  jurisdiction: string;
  changeType: string;
  statutoryReference: string | null;
  effectiveDate: string | null;
}

interface GeminiRequest {
  contents: {
    parts: { text: string }[];
  }[];
  generationConfig?: {
    responseMimeType?: string;
  };
}

interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message: string;
  };
}

/**
 * Uses Gemini 2.5 Flash to automatically generate a structured compliance detection rule
 * from the details of a regulatory update.
 */
export async function generateRuleFromUpdate(
  update: RegulatoryUpdateInput
): Promise<GeneratedRule> {
  const apiKey = process.env.GOOGLE_GEMINI_SA_KEY;

  if (!apiKey) {
    throw new Error("GOOGLE_GEMINI_SA_KEY environment variable is not set.");
  }

  const prompt = `
    You are an expert compliance officer and software engineer specializing in Canadian credit reporting laws.
    
    Given the following regulatory update, generate a dynamic scanning rule to automatically detect violations of this regulation in consumer credit files (tradelines).

    Regulatory Update Details:
    - Title: ${update.title}
    - Description: ${update.description}
    - Jurisdiction: ${update.jurisdiction}
    - Change Type: ${update.changeType}
    - Statutory Reference: ${update.statutoryReference || "None"}
    - Effective Date: ${update.effectiveDate || "None"}

    Your task is to generate a JSON object matching this schema perfectly:
    {
      "title": "A short, descriptive title for the rule",
      "description": "What this rule checks and why",
      "ruleDefinition": {
        "logic": "AND" | "OR",
        "conditions": [
          {
            "field": "A field name from the Tradeline table (e.g. status, currentBalance, dateOfFirstDelinquency, accountType, isCollectionAccount, collectionAgencyName, originalCreditorName, lastReportedDate, dateClosed)",
            "operator": "equals" | "notEquals" | "contains" | "greaterThan" | "lessThan" | "isNull" | "isNotNull" | "olderThanDays" | "newerThanDays" | "matchesPattern",
            "value": any (the value to check against, e.g. "active", 0, 180 (for days), null)
          }
        ]
      },
      "violationCategory": "MUST be exactly one of: ${ViolationCategoryArrayValues.join(', ')}",
      "severity": "HIGH" | "MEDIUM" | "LOW",
      "confidenceScore": float between 0.0 and 1.0 (e.g., 0.85),
      "userExplanationTemplate": "A user-friendly explanation of the violation. Can use placeholders like {creditorName}, {accountNumber}, {field}, {value}.",
      "recommendedActionTemplate": "Actionable advice for the consumer.",
      "statutoryBasis": "The legal or statutory reference (e.g., FCAC Guideline, Provincial Act section)."
    }

    Return ONLY valid JSON and nothing else.
  `;

  const requestBody: GeminiRequest = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
    },
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Dynamic Rule Generator] API request failed with status ${response.status}:`, errorText);
    throw new Error(`Failed to fetch from Gemini API: ${response.status}`);
  }

  const data = (await response.json()) as GeminiResponse;

  if (data.error) {
    console.error("[Dynamic Rule Generator] API returned error:", data.error.message);
    throw new Error(`Gemini API Error: ${data.error.message}`);
  }

  const extractedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!extractedText) {
    throw new Error("[Dynamic Rule Generator] No text returned from Gemini.");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extractedText);
  } catch (e) {
    const match = extractedText.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsedJson = JSON.parse(match[0]);
      } catch (e2) {
        throw new Error("Could not parse JSON from Gemini response.");
      }
    } else {
      throw new Error("No valid JSON structure found in response.");
    }
  }

  const result = GeneratedRuleSchema.safeParse(parsedJson);

  if (!result.success) {
    console.error("[Dynamic Rule Generator] Schema validation failed:", result.error);
    throw new Error("Generated rule failed schema validation.");
  }

  return result.data;
}