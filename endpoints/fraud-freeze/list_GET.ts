import { schema, OutputType } from "./list_GET.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { logRead } from "../../helpers/auditLogger";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    const url = new URL(request.url);
    const searchParams = Object.fromEntries(url.searchParams.entries());
    
    const input = schema.parse({
      userId: searchParams.userId ? Number(searchParams.userId) : undefined,
      status: searchParams.status || undefined,
    });

    // Authorization check: Only admin can view other users' freezes
    if (input.userId && input.userId !== user.id && user.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    }

    // Default to current user if not admin specifying another user
    const targetUserId = input.userId || user.id;

    let query = db
      .selectFrom("identityTheftFreeze")
      .innerJoin("bureau", "identityTheftFreeze.bureauId", "bureau.id")
      .innerJoin("userAccount", "identityTheftFreeze.userId", "userAccount.userId")
      .select([
        "identityTheftFreeze.id",
        "identityTheftFreeze.userId",
        "identityTheftFreeze.bureauId",
        "identityTheftFreeze.freezeType",
        "identityTheftFreeze.status",
        "identityTheftFreeze.requestDate",
        "identityTheftFreeze.effectiveDate",
        "identityTheftFreeze.expirationDate",
        "identityTheftFreeze.thawDate",
        "identityTheftFreeze.notes",
        "identityTheftFreeze.verificationDocuments",
        "identityTheftFreeze.region",
        "identityTheftFreeze.createdAt",
        "identityTheftFreeze.updatedAt",
        "bureau.name as bureauName",
        "userAccount.email as userEmail",
        "userAccount.fullName as userFullName",
      ])
      .where("identityTheftFreeze.userId", "=", targetUserId);

    if (input.status) {
      query = query.where("identityTheftFreeze.status", "=", input.status);
    }

    const freezes = await query.orderBy("identityTheftFreeze.requestDate", "desc").execute();

    // Log audit
    await logRead(user.id, "USER_ACCOUNT", targetUserId, request);

    return new Response(JSON.stringify({ freezes } satisfies OutputType));
    } catch (error) {
    return handleEndpointError(error);
  }
}