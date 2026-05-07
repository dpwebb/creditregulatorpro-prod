import { schema, type OutputType } from "./search_GET.schema";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { searchLegalAuthorities } from "../../helpers/legalAuthorityRegistry";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    await getServerUserSession(request);

    const url = new URL(request.url);
    const input = schema.parse({
      query: url.searchParams.get("query") || undefined,
      regulationId: url.searchParams.get("regulationId") || undefined,
      violationCategory: url.searchParams.get("violationCategory") || undefined,
      fieldName: url.searchParams.get("fieldName") || undefined,
      jurisdiction: url.searchParams.get("jurisdiction") || undefined,
      supportLevel: url.searchParams.get("supportLevel") || undefined,
      limit: url.searchParams.get("limit") || undefined,
    });

    const authorities = searchLegalAuthorities({
      query: input.query,
      regulationIds: input.regulationId ? [input.regulationId] : undefined,
      violationCategory: input.violationCategory,
      fieldName: input.fieldName,
      jurisdiction: input.jurisdiction,
      supportLevel: input.supportLevel,
      limit: input.limit,
    });

    return new Response(JSON.stringify({ authorities } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}
