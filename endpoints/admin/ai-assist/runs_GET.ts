import { sql } from "kysely";

import { db } from "../../../helpers/db";
import {
  BusinessRuleError,
  handleEndpointError,
} from "../../../helpers/endpointErrorHandler";
import { ensureAiAssistRunSchema } from "../../../helpers/aiAssistRunStore";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { schema, OutputType } from "./runs_GET.schema";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      throw new BusinessRuleError("Admin privileges required", 403);
    }

    const url = new URL(request.url);
    const input = schema.parse(Object.fromEntries(url.searchParams.entries()));

    await ensureAiAssistRunSchema();

    const [runsResult, countResult] = await Promise.all([
      sql<OutputType["runs"][number]>`
        select
          id::integer as "id",
          feature_key as "featureKey",
          subject_type as "subjectType",
          subject_id::integer as "subjectId",
          user_id::integer as "userId",
          provider,
          model,
          status,
          input_hash as "inputHash",
          output_json as "outputJson",
          error_code as "errorCode",
          created_at as "createdAt"
        from public.ai_assist_run
        order by created_at desc
        limit ${input.limit}
        offset ${input.offset}
      `.execute(db),
      sql<{ total: number }>`
        select count(*)::integer as total
        from public.ai_assist_run
      `.execute(db),
    ]);

    const runs = runsResult.rows.map((run) => {
      const createdAt = run.createdAt as unknown;
      return {
        ...run,
        createdAt:
          createdAt instanceof Date
            ? createdAt.toISOString()
            : String(createdAt),
      };
    });

    return new Response(
      JSON.stringify({
        runs,
        total: countResult.rows[0]?.total ?? 0,
      } satisfies OutputType),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}
