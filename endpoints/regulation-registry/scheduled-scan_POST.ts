import { OutputType, schema } from "./scheduled-scan_POST.schema";
import { deriveCronSecret } from "../../helpers/cronSecret";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { runRegulationUpdateScan } from "../../helpers/regulationRegistryService";

const CRON_SECRET = deriveCronSecret("regulation-registry-scan-cron");

export async function handle(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.has("token")) {
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid or missing token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const authHeader = request.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7).trim() : null;

    if (!bearerToken || bearerToken !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid or missing token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    schema.parse(JSON.parse((await request.text()) || "{}"));
    const result = await runRegulationUpdateScan({
      mode: "scheduled",
      triggeredByUserId: null,
      fetchConfiguredSources: true,
      sourceDocuments: [],
    });

    return new Response(JSON.stringify(result satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
