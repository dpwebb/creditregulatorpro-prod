import { schema, OutputType } from "./create_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    
    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    const result = await db
      .insertInto("reportArtifact")
      .values({
        tradelineId: input.tradelineId,
        reportDate: input.reportDate,
        artifactType: input.artifactType,
        data: input.data,
        storageUrl: input.storageUrl,
        sha256: input.sha256,
        expiresAt: input.expiresAt,
        userId: user.id,
        region: "CA", // Enforce CA region
        createdAt: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return new Response(JSON.stringify({ artifact: result } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}