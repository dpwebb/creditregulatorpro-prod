import { schema, OutputType, SampleProblem } from "./anonymous-report_POST.schema";

import { db } from "../../helpers/db";
import { checkRateLimit, RateLimitConfig } from "../../helpers/rateLimiter";
import { validateOrigin } from "../../helpers/domainGuard";
import { OriginNotAllowedError } from "../../helpers/endpointErrorHandler";
import { extractHtmlWithFallbackChain } from "../../helpers/fallbackPdfExtractor";
import { routeHtmlToComprehensiveResult } from "../../helpers/bureauDetectionRouter";
import { generateAnonymousPreview } from "../../helpers/anonymousCompliancePreview";
import { cleanupArtifactOnly } from "../../helpers/ingestCleanup";
import crypto from "crypto";
import { ZodError } from "zod";

export async function handle(request: Request) {
  // Track artifact id so we can update processingStatus in catch block
  let artifactId: number | null = null;

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

    let input: ReturnType<typeof schema.parse>;
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

    // 2. Insert temporary artifact into DB with claim token
    const claimToken = crypto.randomUUID();
    const initialData = {
      fileName: input.fileName,
      claimToken,
      extractionStatus: "pending",
      isAnonymous: true,
    };

    const artifact = await db
      .insertInto("reportArtifact")
      .values({
        region: input.region,
        data: JSON.stringify(initialData),
        processingStatus: "pending",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    artifactId = artifact.id;

    // 3. Extract HTML via AI fallback chain (Gemini → OpenAI)
    await db
      .updateTable("reportArtifact")
      .set({ processingStatus: "extracting" })
      .where("id", "=", artifactId)
      .execute();

    console.log("[Anonymous Upload] Starting AI extraction...");
    const fallbackResult = await extractHtmlWithFallbackChain(input.bytesBase64);

    if (fallbackResult === null) {
      throw new Error("AI extraction failed. All extraction methods were unable to process the document.");
    }

    console.log(`[Anonymous Upload] AI extraction succeeded via ${fallbackResult.source}.`);
    const rawHtml = fallbackResult.html;

    await db
      .updateTable("reportArtifact")
      .set({
        data: JSON.stringify({
          ...initialData,
          extractionStatus: "extracted",
          extractionSource: fallbackResult.source,
          docstrangeRawHtml: fallbackResult.html,
        }),
      })
      .where("id", "=", artifactId)
      .execute();

    // 4. Parse the comprehensive result and run compliance preview
    const parseResult = routeHtmlToComprehensiveResult(rawHtml);
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

    await db
      .updateTable("reportArtifact")
      .set({ processingStatus: "completed" })
      .where("id", "=", artifactId)
      .execute();

    const responseData: OutputType = {
      problemCount,
      sampleProblems,
      tempArtifactId: artifactId,
      claimToken,
    };

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[Anonymous Upload] Error:", error);
    const message = error instanceof Error ? error.message : "An unexpected error occurred during processing.";

    // Best-effort: delete the artifact entirely so it doesn't linger in an incomplete state
    if (artifactId !== null) {
      await cleanupArtifactOnly(artifactId);
    }

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500 }
    );
  }
}