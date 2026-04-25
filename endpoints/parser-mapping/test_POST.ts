import { db } from "../../helpers/db";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { schema, OutputType } from "./test_POST.schema";
import superjson from "superjson";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      throw new BusinessRuleError("Unauthorized: Admin role required", 403);
    }

    const json = superjson.parse(await request.text());
    const input = schema.parse(json);

    // Dynamic imports specifically encapsulating massive heavy-processing parser blocks 
    // ensuring thread agility outside test triggers.
    const { detectBureau, routeHtmlToLLMResponse } = await import("../../helpers/bureauDetectionRouter");
    const { mapDocStrangeResponseToResult } = await import("../../helpers/docstrangeParser");
    const { applyOverrides, loadActiveMappings } = await import("../../helpers/parserMappingEngine");
    const { parseHtmlToRawText } = await import("../../helpers/_htmlParserUtils");

    const detectedBureau = input.bureau || detectBureau(input.html);
    const rawText = parseHtmlToRawText(input.html);

    // 1. Raw extraction baseline
    const llmResponse = routeHtmlToLLMResponse(input.html);
    
    // Deep clone prior to mapping since post-processing includes destructive deduplication steps
    const defaultResult = mapDocStrangeResponseToResult(
      JSON.parse(JSON.stringify(llmResponse)), 
      rawText
    );

    // 2. Fetch intended ruleset (all active context vs explicitly mocked subsets)
    let mappings;
    if (input.mappingIds && input.mappingIds.length > 0) {
      mappings = await db
        .selectFrom("parserFieldMapping")
        .selectAll()
        .where("id", "in", input.mappingIds)
        .orderBy("priority", "desc")
        .execute();
    } else {
      mappings = await loadActiveMappings(detectedBureau);
    }

    // 3. Override application simulating production ingestion 
    const overriddenLlmResponse = applyOverrides(
      JSON.parse(JSON.stringify(llmResponse)), 
      mappings
    );
    const overriddenResult = mapDocStrangeResponseToResult(
      overriddenLlmResponse, 
      rawText
    );

    return new Response(
      superjson.stringify({
        defaultResult,
        overriddenResult,
        detectedBureau,
      } satisfies OutputType)
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}