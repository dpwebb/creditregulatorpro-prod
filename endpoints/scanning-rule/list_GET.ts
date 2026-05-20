import { schema, OutputType, ScanningRuleWithUpdate } from "./list_GET.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(JSON.stringify({ error: "Unauthorized access" }), {
        status: 403,
      });
    }

    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status") || undefined;
    const input = schema.parse({
      status: statusParam,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    });

    let query = db
      .selectFrom("dynamicScanningRule")
      .leftJoin("regulatoryUpdateLog", "dynamicScanningRule.regulatoryUpdateId", "regulatoryUpdateLog.id")
      .selectAll("dynamicScanningRule")
      .select("regulatoryUpdateLog.title as regulatoryUpdateTitle")
      .orderBy("dynamicScanningRule.createdAt", "desc");

    if (input.status) {
      query = query.where("dynamicScanningRule.status", "=", input.status);
    }

    const rules = await query
      .limit(input.limit)
      .offset(input.offset)
      .execute();

    return new Response(
      JSON.stringify({
        rules: rules as ScanningRuleWithUpdate[],
      } satisfies OutputType)
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}
