import { schema, OutputType } from "./generate_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError, OriginNotAllowedError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";
import { validateOrigin } from "../../helpers/domainGuard";
import { logAudit } from "../../helpers/auditLogger";

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

    const json = JSON.parse(await request.text());
    const result = schema.parse(json);

    const updateLog = await db
      .selectFrom("regulatoryUpdateLog")
      .selectAll()
      .where("id", "=", result.regulatoryUpdateId)
      .executeTakeFirst();

    if (!updateLog) {
      return new Response(JSON.stringify({ error: "Regulatory update not found" }), {
        status: 404,
      });
    }

    await logAudit({
      action: "SYSTEM_CHANGE",
      entityType: "SYSTEM",
      entityId: updateLog.id,
      userId: user.id,
      details: {
        regulatoryUpdateId: updateLog.id,
        reason: "AI scanning rule generation disabled by deterministic policy",
      },
      status: "SUCCESS",
      request,
    });

    return new Response(
      JSON.stringify({
        error: "AI scanning rule generation is disabled. Create an explicit deterministic rule instead.",
      }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}
