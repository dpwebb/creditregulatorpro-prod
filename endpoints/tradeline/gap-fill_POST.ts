import { schema, OutputType } from "./gap-fill_POST.schema";

import { getServerUserSession } from '../../helpers/getServerUserSession';
import { gapFillTradelines } from '../../helpers/geminiGapFillExtractor';
import { db } from '../../helpers/db';

export async function handle(request: Request) {
  try {
    // 1. Verify the user is authenticated and has admin role
    const { user } = await getServerUserSession(request);

    const text = await request.text();
    const json = JSON.parse(text);
    const { artifactId } = schema.parse(json);

    if (user.role !== "admin") {
      // Check if the user is the owner of the artifact
      const artifact = await db
        .selectFrom("reportArtifact")
        .select("userId")
        .where("id", "=", artifactId)
        .limit(1)
        .executeTakeFirst();

      if (!artifact) {
        return new Response(JSON.stringify({ error: "Artifact not found." }), { status: 404 });
      }

      if (artifact.userId !== user.id) {
        return new Response(JSON.stringify({ error: "Forbidden: You do not have access to this artifact." }), { status: 403 });
      }
    }

    // 2. Look up the artifact's tradelines via tradelineArtifactPresence
    const presences = await db.
    selectFrom("tradelineArtifactPresence").
    select("tradelineId").
    where("reportArtifactId", "=", artifactId).
    execute();

    const tradelineIds = presences.map((p) => p.tradelineId);

    if (tradelineIds.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        updated: 0,
        errors: ["No tradelines associated with this artifact."]
      } satisfies OutputType));
    }

    // 3. Call gapFillTradelines
    const { updated, errors } = await gapFillTradelines(artifactId, tradelineIds);

    // 4. Return the result
    return new Response(JSON.stringify({
      success: true,
      updated,
      errors
    } satisfies OutputType));

  } catch (error) {
    const message = error instanceof Error ? error.message : "An unknown error occurred during gap fill";
    return new Response(JSON.stringify({ error: message }), { status: 400 });
  }
}