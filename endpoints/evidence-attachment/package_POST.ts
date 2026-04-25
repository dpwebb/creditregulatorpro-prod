import { schema } from "./package_POST.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { generateEvidencePackage } from "../../helpers/evidenceManager";
import { checkRateLimit } from "../../helpers/rateLimiter";
import { logAudit } from "../../helpers/auditLogger";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";

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

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
        return handleEndpointError(error);
  }
}