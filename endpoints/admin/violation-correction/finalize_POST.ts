import { db } from "../../../helpers/db";
import { handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { Json } from "../../../helpers/schema";
import { isAdmin } from "../../../helpers/userRoleUtils";
import { finalizeCorrection } from "../../../helpers/violationCorrectionManager";
import { ensureViolationCorrectionSchema } from "../../../helpers/violationCorrectionSchema";
import { schema, OutputType } from "./finalize_POST.schema";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 403 });
    }

    await ensureViolationCorrectionSchema();

    const input = schema.parse(JSON.parse(await request.text()));
    const result = await finalizeCorrection(input.correctionId, user.id);

    await db
      .insertInto("auditLog")
      .values({
        actionType: "UPDATE",
        entityType: "TRADELINE",
        entityId: result.correction.tradelineId,
        userId: user.id,
        details: {
          action: "violation_correction_finalized",
          correctionId: input.correctionId,
          trainingExampleId: result.trainingExample.id,
        } as Json,
        status: "SUCCESS",
        timestamp: new Date(),
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
        userAgent: request.headers.get("user-agent"),
      })
      .execute();

    const output: OutputType = {
      correction: result.correction,
      trainingExample: result.trainingExample,
    };

    return new Response(JSON.stringify(output), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
