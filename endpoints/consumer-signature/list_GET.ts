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
      signatureType: searchParams.signatureType || undefined,
      limit: searchParams.limit ? Number(searchParams.limit) : 50,
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
        // Select freeze details if available
        "identityTheftFreeze.freezeType as freezeType",
        "identityTheftFreeze.status as freezeStatus",
        "identityTheftFreeze.bureauId as freezeBureauId",
      ])
      .where("consumerSignature.userId", "=", user.id);

    if (input.signatureType) {
      query = query.where("consumerSignature.signatureType", "=", input.signatureType);
    }

    const signatures = await query
      .orderBy("consumerSignature.createdAt", "desc")
      .limit(input.limit)
      .execute();

    // Log audit
    await logRead(user.id, "USER_ACCOUNT", user.id, request);

    return new Response(JSON.stringify({ signatures } satisfies OutputType));
    } catch (error) {
    return handleEndpointError(error);
  }
}