import { handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
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
    const result = await finalizeCorrection(input.correctionId, user.id, {
      audit: {
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
        userAgent: request.headers.get("user-agent"),
      },
    });

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
