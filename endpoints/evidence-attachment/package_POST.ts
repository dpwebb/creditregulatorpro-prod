import { schema } from "./package_POST.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { db } from "../../helpers/db";
import { generateEvidencePackage } from "../../helpers/evidenceManager";
import { checkRateLimit } from "../../helpers/rateLimiter";
import { logAudit } from "../../helpers/auditLogger";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    
    // Rate limiting: 5 packages/hour
    const rateLimit = await checkRateLimit(user.id.toString(), "EVIDENCE_PACKAGE_POST", 5, 60);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ error: "Package generation limit reached." }), { status: 429 });
    }

    const json = JSON.parse(await request.text());
    const { obligationInstanceId } = schema.parse(json);

    const ownerCheck = await db
      .selectFrom("obligationInstance")
      .innerJoin("tradeline", "tradeline.id", "obligationInstance.tradelineId")
      .select([
        "tradeline.userId as tradelineUserId",
        "obligationInstance.userId as obligationUserId",
      ])
      .where("obligationInstance.id", "=", obligationInstanceId)
      .executeTakeFirst();

    if (!ownerCheck) {
      throw new BusinessRuleError("Obligation instance not found.", 404);
    }

    const isAdmin = user.role === "admin";
    const ownsTradeline = ownerCheck.tradelineUserId === user.id;
    const ownsObligation = ownerCheck.obligationUserId == null || ownerCheck.obligationUserId === user.id;
    if (!isAdmin && (!ownsTradeline || !ownsObligation)) {
      throw new BusinessRuleError("You do not have access to this obligation instance.", 403);
    }

    const { pdfBuffer, fileName } = await generateEvidencePackage(obligationInstanceId);

    // Audit Log
    await logAudit({
      action: "DOWNLOAD", // Using DOWNLOAD as closest match for generating a package
      entityType: "OBLIGATION_INSTANCE",
      entityId: obligationInstanceId,
      userId: user.id,
      details: { fileName },
      status: "SUCCESS",
      request,
    });

    const pdfBody = pdfBuffer.buffer.slice(
      pdfBuffer.byteOffset,
      pdfBuffer.byteOffset + pdfBuffer.byteLength
    ) as ArrayBuffer;

    return new Response(pdfBody, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
        return handleEndpointError(error);
  }
}
