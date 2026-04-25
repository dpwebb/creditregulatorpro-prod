import { schema, OutputType } from "./delete_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { deleteReportArtifactCascade } from "../../helpers/deleteReportArtifactCascade";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    
    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    console.log(`User ${user.id} requesting deletion of report artifact ${input.id}`);

    // Verify the report artifact exists and belongs to the user before deleting.
    // Admins can delete any artifact; non-admins are scoped to their own.
    let ownershipQuery = db
      .selectFrom("reportArtifact")
      .select("id")
      .where("id", "=", input.id);

    if (user.role !== "admin") {
      ownershipQuery = ownershipQuery.where("userId", "=", user.id);
    }

    const existing = await ownershipQuery.executeTakeFirst();

    if (!existing) {
      console.warn(
        `Report artifact ${input.id} not found or not owned by user ${user.id} (role: ${user.role})`
      );
      return new Response(
        JSON.stringify({ error: "Report artifact not found or access denied" }),
        { status: 404 }
      );
    }

    // Perform cascade deletion
    await deleteReportArtifactCascade(input.id, user.id, request);

    console.log(`Report artifact ${input.id} successfully deleted by user ${user.id}`);

    return new Response(JSON.stringify({ success: true } satisfies OutputType));
  } catch (error) {
    console.error("Error deleting report artifact:", error);
    return handleEndpointError(error);
  }
}