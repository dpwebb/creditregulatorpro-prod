import { schema, OutputType } from "./candidates_GET.schema";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";
import { ensureRegulationRegistrySchema } from "../../helpers/regulationRegistrySchema";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    await ensureRegulationRegistrySchema();

    const url = new URL(request.url);
    const input = schema.parse({
      status: url.searchParams.get("status") || undefined,
      changeClassification: url.searchParams.get("changeClassification") || undefined,
      jurisdiction: url.searchParams.get("jurisdiction") || undefined,
    });

    let query = db.selectFrom("regulationUpdateCandidate").selectAll();

    if (input.status) query = query.where("status", "=", input.status);
    if (input.changeClassification) query = query.where("changeClassification", "=", input.changeClassification);
    if (input.jurisdiction) query = query.where("jurisdiction", "=", input.jurisdiction);

    const candidates = await query.orderBy("detectedAt", "desc").limit(300).execute();

    return new Response(JSON.stringify({ candidates } satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
