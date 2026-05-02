import { z } from "zod";
import { 
  RegulatoryChangeTypeArrayValues, 
  RegulatoryUpdateSourceArrayValues,
  RegulatoryChangeType,
  RegulatoryUpdateSource
} from "./schema";
import { CANADIAN_JURISDICTIONS } from "./canadianJurisdictions";

export interface ScannedUpdate {
  title: string;
  description: string;
  jurisdiction: string;
  changeType: RegulatoryChangeType;
  source: RegulatoryUpdateSource;
  statutoryReference: string | null;
  effectiveDate: string | null;
  sourceUrl: string | null;
  impactAssessment: string | null;
  actionRequired: string | null;
}

const ScannedUpdateSchema = z.object({
  title: z.string(),
  description: z.string(),
  jurisdiction: z.string(),
  changeType: z.enum(RegulatoryChangeTypeArrayValues),
  source: z.enum(RegulatoryUpdateSourceArrayValues),
  statutoryReference: z.string().nullable(),
  effectiveDate: z.string().nullable(), // expecting ISO string or null
  sourceUrl: z.string().nullable(),
  impactAssessment: z.string().nullable(),
  actionRequired: z.string().nullable(),
});

const GeminiResponseSchema = z.array(ScannedUpdateSchema);

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
 * Scans for recent and upcoming Canadian regulatory changes using Gemini AI.
 * 
 * @param existingTitles List of titles already in the database to avoid duplicates.
 * @returns An array of scanned regulatory updates.
 */
export async function scanForRegulatoryUpdates(existingTitles: string[]): Promise<ScannedUpdate[]> {
  const apiKey = process.env.GOOGLE_GEMINI_SA_KEY;

  if (!apiKey) {
    throw new Error("GOOGLE_GEMINI_SA_KEY environment variable is not set.");
  }

  const existingTitlesContext = existingTitles.length > 0 
    ? `Do NOT include any updates with titles similar to the following:\n${existingTitles.map(t => `- ${t}`).join('\n')}`
    : "No existing titles to exclude.";

  const prompt = `
    You are a regulatory compliance AI specializing in Canadian financial, credit reporting, and consumer protection laws.
    
    Identify recent, upcoming, or proposed regulatory changes relevant to:
    - Credit reporting (FCAC guidelines, CG-3, etc.)
    - Consumer protection (provincial and federal)
    - OSFI guidelines affecting credit
    - PIPEDA / privacy changes affecting credit data
    - Provincial consumer protection acts (Ontario, BC, Quebec, Nova Scotia, Alberta, etc.)
    - Debt collection regulations
    - Bankruptcy and insolvency rules

    The jurisdictions to consider are: ${CANADIAN_JURISDICTIONS.join(", ")}.
    Use the exact jurisdiction name as listed above in the "jurisdiction" field.

    ${existingTitlesContext}

    Return an array of JSON objects. Each object MUST strictly adhere to this schema:
    {
      "title": string (A concise, professional title for the update),
      "description": string (Detailed summary of the change),
      "jurisdiction": string (e.g., "Federal", "Ontario", "British Columbia"),
      "changeType": string (Must be one of: ${RegulatoryChangeTypeArrayValues.join(', ')}),
      "source": string (Must be one of: ${RegulatoryUpdateSourceArrayValues.join(', ')} - use "AUTOMATED_SCAN" if unsure),
      "statutoryReference": string or null (e.g., "Bill C-27" or null),
      "effectiveDate": string or null (ISO 8601 date string e.g. "2024-06-01T00:00:00Z" or null if unknown),
      "sourceUrl": string or null (Valid URL to the official source or news release if available, otherwise null),
      "impactAssessment": string or null (How this impacts credit bureaus, furnishers, or debt collectors),
      "actionRequired": string or null (What actions a regulated entity needs to take)
    }

    Return ONLY the valid JSON array and nothing else. Ensure the response is parseable JSON.
  `;

  const requestBody: GeminiRequest = {
    contents: [
      {
        parts: [
          { text: prompt },
        ],
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
    console.error(`[Gemini Regulatory Scanner] API request failed with status ${response.status}:`, errorText);
    throw new Error(`Failed to fetch from Gemini API: ${response.status}`);
  }

  const data = (await response.json()) as GeminiResponse;

  if (data.error) {
    console.error("[Gemini Regulatory Scanner] API returned error:", data.error.message);
    throw new Error(`Gemini API Error: ${data.error.message}`);
  }

  const extractedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!extractedText) {
    console.warn("[Gemini Regulatory Scanner] No text returned from Gemini");
    return [];
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extractedText);
  } catch (e) {
    console.error("[Gemini Regulatory Scanner] Failed to parse JSON response:", e);
    const jsonMatch = extractedText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        parsedJson = JSON.parse(jsonMatch[0]);
      } catch (e2) {
        throw new Error("Could not parse JSON from Gemini response");
      }
    } else {
      throw new Error("Could not find JSON array in Gemini response");
    }
  }

  const result = GeminiResponseSchema.safeParse(parsedJson);

  if (!result.success) {
    console.error("[Gemini Regulatory Scanner] Schema validation failed:", result.error);
    throw new Error("Gemini output failed schema validation");
  }

  return result.data as ScannedUpdate[];
}
