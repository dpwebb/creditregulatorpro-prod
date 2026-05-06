import { schema, OutputType } from "./validate-readiness_POST.schema";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { evaluatePacketReadiness } from "../../helpers/packetReadiness";

export async function handle(request: Request) {
  try {
    // 1. Authenticate user
    const { user } = await getServerUserSession(request);

    // Parse input
    const json = JSON.parse(await request.text());
    const { tradelineId } = schema.parse(json);

    // 2. Query user_account table.
    // Prefer userId linkage; keep an email fallback for legacy rows where userId is null.
    let userAccount = await db
      .selectFrom("userAccount")
      .where("userId", "=", user.id)
      .selectAll()
      .executeTakeFirst();

    if (!userAccount) {
      userAccount = await db
        .selectFrom("userAccount")
        .where("email", "=", user.email)
        .selectAll()
        .executeTakeFirst();
    }

    // 3. Query tradeline table
    const tradeline = await db
      .selectFrom("tradeline")
      .where("id", "=", tradelineId)
      .select(["userId", "bureauId"])
      .executeTakeFirst();

    if (!tradeline) {
      return new Response(
        JSON.stringify({ error: "Tradeline not found" }),
        { status: 404 }
      );
    }

        // Authorization check: Admins can validate any tradeline, users only their own
    if (user.role !== "admin" && tradeline.userId !== user.id) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized access to this tradeline",
        }),
        { status: 403 }
      );
    }

    // 4. Query bureau table
    let bureau = null;
    if (tradeline.bureauId) {
      bureau = await db
        .selectFrom("bureau")
        .where("id", "=", tradeline.bureauId)
        .selectAll()
        .executeTakeFirst();
    }

    // 5. Return validation results
    const readiness = evaluatePacketReadiness({ userAccount, bureau });

    return new Response(
      JSON.stringify({
        isReady: readiness.isReady,
        missingUserFields: readiness.missingUserFields,
        missingBureauInfo: readiness.missingBureauInfo,
        bureauName: readiness.bureauName,
      } satisfies OutputType)
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}
