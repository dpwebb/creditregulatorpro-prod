import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { schema, OutputType } from "./list_GET.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";

export async function handle(request: Request) {
  try {
    // Auth check
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 403 }
      );
    }

    // Fetch test cases with latest run info
    const testCases = await db
      .selectFrom("parserTestCase")
      .selectAll("parserTestCase")
      .select((eb) => [
        eb
          .selectFrom("parserTestRun")
          .select("passed")
          .whereRef("parserTestRun.testCaseId", "=", "parserTestCase.id")
          .orderBy("runAt", "desc")
          .limit(1)
          .as("lastRunPassed"),
        eb
          .selectFrom("parserTestRun")
          .select("runAt")
          .whereRef("parserTestRun.testCaseId", "=", "parserTestCase.id")
          .orderBy("runAt", "desc")
          .limit(1)
          .as("lastRunAt"),
        eb
          .selectFrom("parserTestRun")
          .select(db.fn.count<number>("id").as("count"))
          .whereRef("parserTestRun.testCaseId", "=", "parserTestCase.id")
          .as("totalRuns"),
      ])
      .orderBy("updatedAt", "desc")
      .execute();

    const output: OutputType = {
      testCases: testCases.map((tc) => ({
        id: tc.id,
        name: tc.name,
        description: tc.description,
        lastRunPassed: tc.lastRunPassed,
        lastRunAt: tc.lastRunAt,
        totalRuns: Number(tc.totalRuns || 0),
        updatedAt: tc.updatedAt,
      })),
    };

    return new Response(JSON.stringify(output));
  } catch (error) {
    return handleEndpointError(error);
  }
}