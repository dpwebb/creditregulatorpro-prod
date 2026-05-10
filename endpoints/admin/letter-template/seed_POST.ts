import { OutputType } from "./seed_POST.schema";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { logAudit } from "../../../helpers/auditLogger";
import { seedLetterTemplateDefaults } from "../../../helpers/seedLetterTemplateDefaults";
import superjson from "superjson";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      return new Response(superjson.stringify({ error: "Admin privileges required" }), { status: 403 });
    }

    const seedResult = await seedLetterTemplateDefaults(user.id);

    await logAudit({
      action: "CREATE",
      entityType: "SYSTEM",
      userId: user.id,
      status: "SUCCESS",
      details: {
        component: "letter_template",
        mode: "SEED",
        seeded: seedResult.seeded,
        updated: seedResult.updated,
        total: seedResult.total,
      },
      request,
    });

    return new Response(superjson.stringify(seedResult satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}
