import { schema, OutputType } from "./extract_POST.schema";

import { parseReport } from "../../helpers/reportParser";
import { normalizeTradelines } from "../../helpers/normalization";
import { scoreTradelines } from "../../helpers/confidenceScorer";
import { logAudit } from "../../helpers/auditLogger";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";

export async function handle(request: Request) {
  try {
    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

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