import { schema, OutputType } from "./list_GET.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { getEvidenceAttachments } from "../../helpers/evidenceManager";
import { checkRateLimit } from "../../helpers/rateLimiter";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    
    // Rate limiting: 20 requests/minute
    const rateLimit = await checkRateLimit(user.id.toString(), "EVIDENCE_LIST_GET", 20, 1);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 });
    }

    const url = new URL(request.url);
    const obligationInstanceIdParam = url.searchParams.get("obligationInstanceId");
    const packetIdParam = url.searchParams.get("packetId");

    const validatedInput = schema.parse({
      obligationInstanceId: obligationInstanceIdParam ? parseInt(obligationInstanceIdParam, 10) : undefined,
      packetId: packetIdParam ? parseInt(packetIdParam, 10) : undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    });

    const isAdmin = user.role === "admin";

    // Verify ownership of the referenced resource before listing
    if (validatedInput.obligationInstanceId !== undefined) {
      const ownerCheck = await db
        .selectFrom("obligationInstance")
        .innerJoin("tradeline", "tradeline.id", "obligationInstance.tradelineId")
        .select(["tradeline.userId"])
        .where("obligationInstance.id", "=", validatedInput.obligationInstanceId)
        .executeTakeFirst();

      if (!ownerCheck) {
        return new Response(JSON.stringify({ error: "Obligation instance not found." }), { status: 404 });
      }
      if (!isAdmin && ownerCheck.userId !== user.id) {
        return new Response(JSON.stringify({ error: "You do not have access to this obligation instance." }), { status: 403 });
      }
    }

    if (validatedInput.packetId !== undefined) {
      const ownerCheck = await db
        .selectFrom("packet")
        .select(["userId"])
        .where("id", "=", validatedInput.packetId)
        .executeTakeFirst();

      if (!ownerCheck) {
        return new Response(JSON.stringify({ error: "Packet not found." }), { status: 404 });
      }
      if (!isAdmin && ownerCheck.userId !== user.id) {
        return new Response(JSON.stringify({ error: "You do not have access to this packet." }), { status: 403 });
      }
    }

    const attachments = await getEvidenceAttachments({
      obligationInstanceId: validatedInput.obligationInstanceId,
      packetId: validatedInput.packetId,
      limit: validatedInput.limit,
      offset: validatedInput.offset,
    });

    // Sanitize output: remove storageUrl (base64 data) to keep response light
    const sanitizedAttachments = attachments.map(({ storageUrl, ...rest }) => rest);

    return new Response(JSON.stringify(sanitizedAttachments satisfies OutputType));
  } catch (error) {
        return handleEndpointError(error);
  }
}
