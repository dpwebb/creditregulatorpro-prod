import { schema, OutputType } from "./get_GET.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { logRead } from "../../helpers/auditLogger";
import { isAdmin } from "../../helpers/userRoleUtils";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const url = new URL(request.url);
    const input = schema.parse({
      id: url.searchParams.get("id") ?? undefined,
    });

    let query = db
      .selectFrom("consumerSignature")
      .leftJoin("identityTheftFreeze", "consumerSignature.associatedFreezeId", "identityTheftFreeze.id")
      .select([
        "consumerSignature.id",
        "consumerSignature.userId",
        "consumerSignature.signatureData",
        "consumerSignature.signatureType",
        "consumerSignature.isVerified",
        "consumerSignature.verifiedAt",
        "consumerSignature.verifiedBy",
        "consumerSignature.associatedFreezeId",
        "consumerSignature.metadata",
        "consumerSignature.createdAt",
        "identityTheftFreeze.freezeType as freezeType",
        "identityTheftFreeze.status as freezeStatus",
        "identityTheftFreeze.bureauId as freezeBureauId",
      ])
      .where("consumerSignature.id", "=", input.id);

    if (!isAdmin(user)) {
      query = query.where("consumerSignature.userId", "=", user.id);
    }

    const signature = await query.executeTakeFirst();

    if (!signature) {
      return new Response(JSON.stringify({ error: "Signature not found" }), { status: 404 });
    }

    await logRead(user.id, "USER_ACCOUNT", signature.userId, request);

    return new Response(JSON.stringify({ signature } satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
