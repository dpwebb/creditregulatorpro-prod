import { schema, OutputType, SampleProblem } from "./anonymous-report_POST.schema";

import { checkRateLimit, RateLimitConfig } from "../../helpers/rateLimiter";
import { validateOrigin } from "../../helpers/domainGuard";
import { OriginNotAllowedError } from "../../helpers/endpointErrorHandler";
import { generateAnonymousPreview } from "../../helpers/anonymousCompliancePreview";
import { extractCanonicalCreditReport } from "../../helpers/canonicalCreditReportExtractor";
import { isScannedPdfUnsupportedError } from "../../helpers/creditReportPdfEligibility";
import { logRejectedScannedPdfUpload } from "../../helpers/creditReportUploadRejectionAudit";
import { ZodError } from "zod";

export async function handle(request: Request) {
  let input: ReturnType<typeof schema.parse> | null = null;

  try {
    const guardResult = await validateOrigin(request);
    if (!guardResult.valid && guardResult.mode === "enforce") {
      throw new OriginNotAllowedError();
    }

    const text = await request.text();

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (parseError) {
      console.warn("[Anonymous Upload] Failed to parse request body:", parseError instanceof Error ? parseError.message : parseError);
      return new Response(
        JSON.stringify({ error: "Invalid request format. Please try again." }),
        { status: 400 }
      );
    }

    try {
      input = schema.parse(json);
    } catch (validationError) {
      if (validationError instanceof ZodError) {
        console.warn("[Anonymous Upload] Schema validation failed:", validationError.errors);
        return new Response(
          JSON.stringify({ error: "Please upload a PDF file to continue." }),
          { status: 400 }
        );
      }
      throw validationError;
    }

    // 1. Rate limiting by IP
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown_ip";
    const rateLimit = await checkRateLimit(ip, "ANON_UPLOAD", RateLimitConfig.ANONYMOUS_UPLOAD.maxAttempts, RateLimitConfig.ANONYMOUS_UPLOAD.windowMinutes);

    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ error: "Too many upload attempts. Please try again later." }),
        { status: 429 }
      );
    }

    if (input.mimeType !== "application/pdf") {
      return new Response(
        JSON.stringify({ error: "Unsupported file type. Please upload a PDF." }),
        { status: 400 }
      );
    }

    // 2. Generate the preview from the same canonical extraction path used by authenticated ingest.
    const extraction = await extractCanonicalCreditReport({
      bytesBase64: input.bytesBase64,
      mimeType: input.mimeType,
      allowAiFallback: false,
    });
    const parseResult = extraction.parseResult;

    const previewProblems = generateAnonymousPreview(parseResult);

    const sampleProblems: SampleProblem[] = previewProblems.map((p) => ({
      type: p.type,
      title: p.title,
      detail: p.detail,
      solution: p.solution,
      urgency: p.urgency,
    }));

    // Exclude the fallback info item from the problem count
    const problemCount = sampleProblems.filter((p) => p.urgency !== "info").length;

    const responseData: OutputType = {
      problemCount,
      sampleProblems,
    };

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[Anonymous Upload] Error:", error);
    if (input && isScannedPdfUnsupportedError(error)) {
      await logRejectedScannedPdfUpload({
        route: "anonymous_preview",
        bytesBase64: input.bytesBase64,
        mimeType: input.mimeType,
        quality: error.quality,
        ocrDiagnostics: error.ocrDiagnostics,
        request,
      });

      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const message = error instanceof Error ? error.message : "An unexpected error occurred during processing.";

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500 }
    );
  }
}
