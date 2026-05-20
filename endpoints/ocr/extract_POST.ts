import { OCR_EXTRACT_UPLOAD_MAX_BYTES, schema, OutputType } from "./extract_POST.schema";

import { extractCanonicalCreditReport } from "../../helpers/canonicalCreditReportExtractor";
import { normalizeTradelines } from "../../helpers/normalization";
import { scoreTradelines } from "../../helpers/confidenceScorer";
import { BusinessRuleError, handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { checkRateLimit, RateLimitConfig } from "../../helpers/rateLimiter";
import { isScannedPdfUnsupportedError } from "../../helpers/creditReportPdfEligibility";
import { logRejectedScannedPdfUpload } from "../../helpers/creditReportUploadRejectionAudit";
import {
  isUploadRequestContentLengthTooLarge,
  isUploadRequestTextTooLarge,
  uploadRequestTooLargeResponse,
} from "../../helpers/uploadPayloadValidation";

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

    if (isUploadRequestContentLengthTooLarge(request, OCR_EXTRACT_UPLOAD_MAX_BYTES)) {
      return uploadRequestTooLargeResponse("PDF file", OCR_EXTRACT_UPLOAD_MAX_BYTES);
    }

    const text = await request.text();
    if (isUploadRequestTextTooLarge(text, OCR_EXTRACT_UPLOAD_MAX_BYTES)) {
      return uploadRequestTooLargeResponse("PDF file", OCR_EXTRACT_UPLOAD_MAX_BYTES);
    }

    const json = JSON.parse(text);
    const input = schema.parse(json);

    // 1. Parse the report
    // Note: We are not persisting anything yet.
    let parsedTradelines = [];
    try {
      const extraction = await extractCanonicalCreditReport({
        bytesBase64: input.bytesBase64,
        mimeType: input.mimeType,
        allowAiFallback: false,
      });
      parsedTradelines = extraction.parseResult.tradelines;
    } catch (e) {
      console.error("OCR Extraction failed:", e);
      if (isScannedPdfUnsupportedError(e)) {
        await logRejectedScannedPdfUpload({
          route: "ocr_extract",
          userId: user.id,
          bytesBase64: input.bytesBase64,
          mimeType: input.mimeType,
          quality: e.quality,
          ocrDiagnostics: e.ocrDiagnostics,
          request,
        });

        throw new BusinessRuleError(e.message, 400);
      }
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
