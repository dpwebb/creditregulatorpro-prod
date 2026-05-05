import { db } from "../../../helpers/db";
import { handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { isAdmin } from "../../../helpers/userRoleUtils";
import { jsonSafe } from "../../../helpers/violationCorrectionManager";
import { ensureViolationCorrectionSchema } from "../../../helpers/violationCorrectionSchema";
import { schema, OutputType } from "./export_POST.schema";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 403 });
    }

    await ensureViolationCorrectionSchema();

    const text = await request.text();
    const input = schema.parse(text ? JSON.parse(text) : {});

    let query = db
      .selectFrom("violationTrainingExample")
      .selectAll()
      .orderBy("createdAt", "desc");

    if (input.correctionIds?.length) {
      query = query.where("correctionId", "in", input.correctionIds);
    }

    if (input.labels?.length) {
      query = query.where("label", "in", input.labels);
    }

    if (input.useForTrainingOnly ?? true) {
      query = query.where("useForTraining", "=", true);
    }

    const examples = await query.execute();
    const output: OutputType = {
      exportedAt: new Date().toISOString(),
      count: examples.length,
      examples,
    };

    return new Response(JSON.stringify(jsonSafe(output)), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
