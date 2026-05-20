import { schema, OutputType } from "./create_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { normalizeReportArtifactStorageUrlForWrite } from "../../helpers/reportArtifactStorage";

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    
    const json = JSON.parse(await request.text());
    const input = schema.parse(json);
    const data = jsonRecord(input.data);
    const storageUrl = await normalizeReportArtifactStorageUrlForWrite({
      storageUrl: input.storageUrl,
      userId: user.id,
      fileName: typeof data.fileName === "string" ? data.fileName : undefined,
      mimeType: typeof data.mimeType === "string" ? data.mimeType : input.artifactType,
      sha256: input.sha256,
    });

    const result = await db
      .insertInto("reportArtifact")
      .values({
        tradelineId: input.tradelineId,
        reportDate: input.reportDate,
        artifactType: input.artifactType,
        data: input.data,
        storageUrl,
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
