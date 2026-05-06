import { schema, OutputType } from "./generate-all_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError, OriginNotAllowedError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";
import { validateOrigin } from "../../helpers/domainGuard";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(JSON.stringify({ error: "Unauthorized access" }), {
        status: 403,
      });
    }

    const guardResult = await validateOrigin(request);
    if (!guardResult.valid && guardResult.mode === "enforce") {
      throw new OriginNotAllowedError();
    }

    // Ensure we parse the body (even if empty) to validate the schema
    const json = JSON.parse(await request.text());
    schema.parse(json);

    // Count total regulatory updates to provide meaningful feedback
    const totalResult = await db
      .selectFrom("regulatoryUpdateLog")
      .select((eb) => eb.fn.countAll<number>().as("total"))
      .executeTakeFirstOrThrow();
    const total = Number(totalResult.total);

    // Find all regulatory updates that do not have an associated scanning rule
    const pendingUpdates = await db
      .selectFrom("regulatoryUpdateLog")
      .where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom("dynamicScanningRule")
              .select("id")
              .whereRef("dynamicScanningRule.regulatoryUpdateId", "=", "regulatoryUpdateLog.id")
          )
        )
      )
      .selectAll()
      .execute();

    let generated = 0;
    let skipped = 0;
    let errors = 0;
    let message = "";

    if (pendingUpdates.length === 0) {
      if (total === 0) {
        message = "No regulatory updates exist yet.";
      } else {
        message = `All ${total} regulatory update${total === 1 ? "" : "s"} already have scanning rules generated. No new rules needed.`;
      }
    }

    if (pendingUpdates.length > 0) {
      skipped = pendingUpdates.length;
      message = "AI scanning rule generation is disabled. Create explicit deterministic rules for pending regulatory updates.";
    }

    return new Response(
      JSON.stringify({
        generated,
        skipped,
        errors,
        message,
      } satisfies OutputType)
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}
