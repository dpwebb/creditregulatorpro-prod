import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { createSSEStream, createSSEResponse } from "../../helpers/sseStreamBuilder";
import { handleIngestProcess } from "../../helpers/ingestReportHandler";
import { ResolvedUserSession } from "../../helpers/ingestSessionResolver";
import { schema } from "./process_POST.schema";

export async function handle(request: Request) {
  let input;
  try {
    const json = JSON.parse(await request.text());
    input = schema.parse(json);
    } catch (error) {
    return handleEndpointError(error);
  }

  // Verify session/user BEFORE entering SSE stream to prevent hanging
  let resolvedSession: ResolvedUserSession;
  try {
    const sessionData = await getServerUserSession(request);
    const user = sessionData.user;
    
    // Validate that the artifact belongs to the user
    const artifact = await db
      .selectFrom("reportArtifact")
      .select(["id", "userId"])
      .where("id", "=", input.artifactId)
      .executeTakeFirst();
      
    if (!artifact) {
      return new Response(JSON.stringify({ error: "Artifact not found" }), { status: 404 });
    }
    
    if (artifact.userId !== user.id) {
      return new Response(JSON.stringify({ error: "Unauthorized access to artifact" }), { status: 403 });
    }

    // Look up userAccount for that user
        const userAccount = await db
      .selectFrom("userAccount")
      .selectAll()
      .where("userId", "=", user.id)
      .executeTakeFirst();
      
    if (!userAccount) {
      throw new Error("User account profile not found. Please complete profile setup.");
    }

    resolvedSession = {
      user,
      userAccount,
      isAuthenticatedUpload: true
    };
  } catch (error) {
    console.error("Session/Artifact validation error:", error);
    return handleEndpointError(error);
  }

  // Return SSE stream to keep connection alive during long AI operations
  const stream = createSSEStream(async (send) => {
    try {
      await handleIngestProcess(resolvedSession, input.artifactId, send);
    } catch (error) {
      console.error("Error in process stream:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      send({ type: "error", error: errorMessage, code: "PROCESSING_ERROR" });
    }
  });

  return createSSEResponse(stream);
}