import { schema, OutputType } from "./extract_POST.schema";

import { parseReport } from "../../helpers/reportParser";
import { normalizeTradelines } from "../../helpers/normalization";
import { scoreTradelines } from "../../helpers/confidenceScorer";
import { BusinessRuleError, handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { checkRateLimit, RateLimitConfig } from "../../helpers/rateLimiter";

const MAX_PDF_BYTES = 15 * 1024 * 1024;

function getDecodedBase64Size(bytesBase64: string): number {
  const payload = bytesBase64.includes(",")
    ? bytesBase64.split(",").pop() || ""
    : bytesBase64;
  const padding = payload.match(/=+$/)?.[0].length || 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const rateLimit = await checkRateLimit(
      user.id.toString(),
      "OCR_EXTRACT_POST",
      RateLimitConfig.REPORT_PARSE.maxAttempts,
      RateLimitConfig.REPORT_PARSE.windowMinutes
    );

    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({
          error: "Too many extraction attempts. Please try again later.",
          resetAt: rateLimit.resetAt.toISOString(),
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    if (input.mimeType !== "application/pdf") {
      throw new BusinessRuleError("Only PDF extraction is supported", 400);
    }

    if (getDecodedBase64Size(input.bytesBase64) > MAX_PDF_BYTES) {
      throw new BusinessRuleError("PDF file exceeds the 15 MB extraction limit", 400);
    }

    // 1. Parse the report
    // Note: We are not persisting anything yet.
    let parsedTradelines = [];
    try {
      const parseResult = await parseReport(input.bytesBase64, input.mimeType);
      parsedTradelines = parseResult.tradelines;
    } catch (e) {
      console.error("OCR Extraction failed:", e);
      throw new Error("Failed to parse document");
    }

    // 2. Normalize the data
    const normalizedTradelines = normalizeTradelines(parsedTradelines);

    // 3. Calculate confidence scores
    const scoredTradelines = scoreTradelines(normalizedTradelines);

    // 4. Generate a review session ID
    // Since we are stateless for this phase, we generate a UUID that the client
    // will pass back to the approve/reject endpoints.
    const reviewSessionId = crypto.randomUUID();

    // 5. Log the extraction attempt (optional but good for audit)
    // We use a generic READ action or similar since we aren't creating a DB record yet
    // However, we don't have a generic "OCR_EXTRACT" action, so we'll skip DB logging 
    // for this stateless step to avoid cluttering audit logs with abandoned uploads.
    // Or we can log as 'READ' on USER_ACCOUNT context.
    
    // 6. Return the result
    return new Response(
      JSON.stringify({
        reviewSessionId,
        extractedData: scoredTradelines,
        tradelinesCount: scoredTradelines.length,
      } satisfies OutputType),
      { 
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );

    } catch (error) {
    return handleEndpointError(error);
  }
}
