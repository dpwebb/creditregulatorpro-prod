import { schema, OutputType } from "./get_GET.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { resolveReportArtifactPdfBase64 } from "../../helpers/reportArtifactStorage";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    
    const url = new URL(request.url);
    const idParam = url.searchParams.get("id");
    
    if (!idParam) {
      return new Response(JSON.stringify({ error: "Missing id parameter" }), { status: 400 });
    }

    // Validate the input using the schema
    const validatedInput = schema.parse({ id: idParam });
    const { id } = validatedInput;

    // Build query
    let query = db
      .selectFrom('reportArtifact')
      .select([
        'id',
        'artifactType',
        'storageUrl',
        'reportDate',
        'metro2Version',
        'sha256',
        'createdAt',
        'userId',
        'organizationId'
      ])
      .where('id', '=', id);

    // Apply data isolation based on user role
    if (user.role === 'admin') {
      // Admin users see all data
    } else {
      // Regular users see only their own data
      query = query.where('userId', '=', user.id);
    }

    const reportArtifact = await query.executeTakeFirst();

    // Return 404 if not found or access denied by the filters above
    if (!reportArtifact) {
      return new Response(JSON.stringify({ error: "Report artifact not found or access denied" }), { status: 404 });
    }

    const resolvedStorageUrl = await resolveReportArtifactPdfBase64(reportArtifact.storageUrl);

    return new Response(JSON.stringify({
      reportArtifact: {
        ...reportArtifact,
        storageUrl: resolvedStorageUrl,
      },
    } satisfies OutputType));
  } catch (error) {
    console.error("Error fetching report artifact:", error);
    return handleEndpointError(error);
  }
}
