/**
 * OCR extraction using Google Gemini API for image-based or low-quality PDFs.
 * Falls back to this when pdf-parse extraction yields insufficient quality text.
 */

interface GeminiContent {
  parts: Array<{
    text?: string;
    inlineData?: {
      mimeType: string;
      data: string;
    };
  }>;
}

interface GeminiGenerationConfig {
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
}

interface GeminiRequest {
  contents: GeminiContent[];
  generationConfig?: GeminiGenerationConfig;
}

interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
    tokenCount?: number;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
  error?: {
    message: string;
    code?: number;
    status?: string;
  };
}

/**
 * Extracts text from a PDF using Google Gemini's vision capabilities.
 * This is used as a fallback when pdf-parse extraction yields low-quality text.
 *
 * @param base64Data The PDF data encoded as base64 string (without data URL prefix)
 * @returns The extracted text content, or empty string if extraction fails
 */
export async function extractTextWithGeminiOcr(
  base64Data: string,
): Promise<string> {
  const apiKey = process.env.GOOGLE_GEMINI_SA_KEY;

  if (!apiKey) {
    console.error(
      "[Gemini OCR] GOOGLE_GEMINI_SA_KEY not found in environment variables",
    );
    return "";
  }

  try {
    console.log("[Gemini OCR] Attempting OCR extraction with Gemini...");

    // Construct the API request
    const requestBody: GeminiRequest = {
      contents: [
        {
          parts: [
            {
              text: `Extract ALL text content from EVERY PAGE of this credit report PDF. This is a multi-page document and you MUST process all pages completely.

CRITICAL REQUIREMENTS:
- Process ALL pages of the PDF (typically 4-7 pages for Credit Monitoring reports)
- DO NOT summarize or truncate - extract VERBATIM content from every page
- The first page usually contains summary information (credit score, account summary, personal info)
- Pages 2 onwards contain INDIVIDUAL ACCOUNT DETAILS - these are the most important
- Extract EVERY SINGLE ACCOUNT/TRADELINE completely, not just a few examples

This is a TransUnion Credit Monitoring PDF format which includes:

PAGE 1 - Summary:
- Credit score and rating
- Account summary (total accounts, open/closed counts)
- Personal information (name, addresses, employment)

PAGES 2+ - Individual Account Details (EXTRACT ALL OF THESE):
For EACH and EVERY account/tradeline, extract:
- Account Name / Creditor Name
- Account Number (full or partial)
- Account Status (Open/Closed/Collections/etc)
- Account Type (Credit Card, Mortgage, Auto Loan, Line of Credit, etc)
- Balance / Current Balance
- High Credit / Credit Limit
- Payment Status (Current, Past Due, etc)
- Date Opened / Date of Last Activity
- Date Closed (if applicable)
- Date Reported / Last Updated
- Terms / Monthly Payment
- Responsibility (Individual, Joint, etc)
- Payment history or remarks
- Any special notations or comments

ALSO EXTRACT:
- Public records section (if present)
- Credit inquiries section (with dates and companies)
- Consumer statements (if any)
- Any other sections present in the document

OUTPUT FORMAT:
- Return the complete extracted text preserving the document structure
- Maintain section headers and account separations
- Include all data fields even if values are blank or N/A
- DO NOT add your own commentary or explanations
- DO NOT stop early - extract until the very last page

If the summary shows 4+ accounts, your output MUST contain details for ALL 4+ accounts, not just 1 or 2.`,
            },
            {
              inlineData: {
                mimeType: "application/pdf",
                data: base64Data,
              },
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 8192, // Increased to ensure large PDFs aren't truncated
        temperature: 0.2, // Lower temperature for more deterministic extraction
      },
    };

    // Call Gemini API
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
        `[Gemini OCR] API request failed with status ${response.status}:`,
        errorText,
      );
      return "";
    }

    const data = (await response.json()) as GeminiResponse;

    // Check for API-level errors
    if (data.error) {
      console.error("[Gemini OCR] API returned error:", data.error.message);
      return "";
    }

    // DEBUG: Log usage metadata if available
    if (data.usageMetadata) {
      console.log(
        `[Gemini OCR] Token usage - Prompt: ${data.usageMetadata.promptTokenCount}, Candidates: ${data.usageMetadata.candidatesTokenCount}, Total: ${data.usageMetadata.totalTokenCount}`,
      );
    }

    // Extract text from response
    const allTextParts: string[] = [];

    if (data.candidates) {
      data.candidates.forEach((candidate, index) => {
        // Log finish reason to detect truncation
        if (candidate.finishReason && candidate.finishReason !== "STOP") {
          console.warn(
            `[Gemini OCR] Candidate ${index} stopped due to: ${candidate.finishReason}. This might indicate truncation.`,
          );
        }

        if (candidate.content && candidate.content.parts) {
          candidate.content.parts.forEach((part) => {
            if (part.text) {
              allTextParts.push(part.text);
            }
          });
        }
      });
    }

    const extractedText = allTextParts.join("\n\n");

    if (!extractedText) {
      console.warn("[Gemini OCR] No text extracted from Gemini response");
      // Debug: log full response structure if empty
      console.log(
        "[Gemini OCR] Full empty response:",
        JSON.stringify(data, null, 2),
      );
      return "";
    }

    // Check for potential truncation based on character count for multi-page docs
    // A typical single page credit report is ~2-3k chars. A 5-page report should be >10k.
    if (extractedText.length < 2000) {
      console.warn(
        `[Gemini OCR] Warning: Extracted text is very short (${extractedText.length} chars). This might indicate the model only processed the first page or summary.`,
      );
    }

    console.log(
      `[Gemini OCR] ✓ Successfully extracted ${extractedText.length} characters from ${allTextParts.length} parts`,
    );
    return extractedText;
  } catch (error) {
    if (error instanceof Error) {
      console.error("[Gemini OCR] Extraction failed:", error.message);
    } else {
      console.error("[Gemini OCR] Extraction failed:", error);
    }
    return "";
  }
}