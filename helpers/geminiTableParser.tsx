import { z } from "zod";

/**
 * Interface for a single row of parsed payment history data.
 */
export interface ParsedPaymentGridRow {
  date?: string;
  balance?: number;
  payment?: number;
  pastDue?: number;
  mop?: string;
  terms?: string;
  highCredit?: number;
  creditLimit?: number;
}

// Simple in-memory cache to avoid repeated API calls for the exact same text
const responseCache = new Map<string, ParsedPaymentGridRow | null>();

// Zod schema for validating the JSON response from Gemini
const GeminiResponseSchema = z.object({
  date: z.string().optional(),
  balance: z.number().nullable().optional(),
  payment: z.number().nullable().optional(),
  pastDue: z.number().nullable().optional(),
  mop: z.string().nullable().optional(),
  terms: z.string().nullable().optional(),
  highCredit: z.number().nullable().optional(),
  creditLimit: z.number().nullable().optional(),
});

interface GeminiContent {
  parts: Array<{
    text: string;
  }>;
}

interface GeminiRequest {
  contents: GeminiContent[];
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
 * Parses the payment history grid from a credit report tradeline text using Google Gemini.
 * It specifically targets the most recent row of data which contains the current status.
 *
 * @param tradelineText The raw text of the tradeline section containing the payment grid
 * @returns The parsed data for the most recent month, or null if parsing fails
 */
export async function parsePaymentGridWithGemini(
  tradelineText: string,
): Promise<ParsedPaymentGridRow | null> {
  // 1. Check cache first
  // We use a simple hash or just the string itself if it's not too huge.
  // Given tradeline text chunks are usually < 2KB, using the string as key is acceptable for this scope.
  if (responseCache.has(tradelineText)) {
    console.log("[Gemini Table Parser] Returning cached result");
    return responseCache.get(tradelineText) || null;
  }

  const apiKey = process.env.GOOGLE_GEMINI_SA_KEY;

  if (!apiKey) {
    console.error(
      "[Gemini Table Parser] GOOGLE_GEMINI_SA_KEY not found in environment variables",
    );
    return null;
  }

  try {
    console.log(
      "[Gemini Table Parser] Attempting to parse payment grid with Gemini...",
    );

    // 2. Construct the prompt
    const prompt = `
      Analyze the following text from a credit report tradeline. It contains a payment history grid or table.
      
      Your task is to identify the MOST RECENT (usually the first or top) row of data in the payment history table and extract the following values:
      - Date (e.g., "Jan 2024", "01/24")
      - Balance Amount
      - Payment Amount (Scheduled or Actual)
      - Past Due Amount
      - MOP (Method of Payment / Rating, e.g., "1", "09", "R1")
      - Terms (e.g., "0", "12")
      - High Credit / High Balance
      - Credit Limit

      The text may be messy or unstructured. Use your understanding of credit report formats (TransUnion, Equifax, Experian) to identify the correct columns.
      
      Return ONLY a valid JSON object with these keys: "date", "balance", "payment", "pastDue", "mop", "terms", "highCredit", "creditLimit".
      - Use null for missing values.
      - Convert all monetary values to numbers (remove currency symbols).
      - Keep "mop" and "terms" as strings.
      - If no payment grid is found, return an empty JSON object {}.

      Here is the text:
      """
      ${tradelineText}
      """
    `;

    const requestBody: GeminiRequest = {
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
      },
    };

    // 3. Call Gemini API
    // Using gemini-2.5-flash as it is fast and capable for this task, similar to the OCR extractor
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[Gemini Table Parser] API request failed with status ${response.status}:`,
        errorText,
      );
      return null;
    }

    const data = (await response.json()) as GeminiResponse;

    if (data.error) {
      console.error(
        "[Gemini Table Parser] API returned error:",
        data.error.message,
      );
      return null;
    }

    const extractedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!extractedText) {
      console.warn("[Gemini Table Parser] No text returned from Gemini");
      return null;
    }

    // 4. Parse and Validate JSON
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(extractedText);
    } catch (e) {
      console.error("[Gemini Table Parser] Failed to parse JSON response:", e);
      // Sometimes Gemini wraps JSON in markdown code blocks despite responseMimeType
      const jsonMatch = extractedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsedJson = JSON.parse(jsonMatch[0]);
        } catch (e2) {
          return null;
        }
      } else {
        return null;
      }
    }

    const result = GeminiResponseSchema.safeParse(parsedJson);

    if (!result.success) {
      console.error(
        "[Gemini Table Parser] Schema validation failed:",
        result.error,
      );
      return null;
    }

    const validatedData = result.data;

    // Clean up the data structure to match our internal interface
    const finalResult: ParsedPaymentGridRow = {
      date: validatedData.date,
      balance: validatedData.balance ?? undefined,
      payment: validatedData.payment ?? undefined,
      pastDue: validatedData.pastDue ?? undefined,
      mop: validatedData.mop ?? undefined,
      terms: validatedData.terms ?? undefined,
      highCredit: validatedData.highCredit ?? undefined,
      creditLimit: validatedData.creditLimit ?? undefined,
    };

    // Check if we actually got any meaningful data (at least one field besides date)
    const hasData = Object.values(finalResult).some(
      (v) => v !== undefined && v !== null,
    );

    if (!hasData) {
      console.log(
        "[Gemini Table Parser] Gemini returned empty object (no grid found)",
      );
      responseCache.set(tradelineText, null);
      return null;
    }

    console.log("[Gemini Table Parser] Successfully parsed grid:", finalResult);
    responseCache.set(tradelineText, finalResult);
    return finalResult;
  } catch (error) {
    console.error("[Gemini Table Parser] Unexpected error:", error);
    return null;
  }
}