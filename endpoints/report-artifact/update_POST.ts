import { schema, OutputType } from "./update_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { normalizeReportArtifactStorageUrlForWrite } from "../../helpers/reportArtifactStorage";
import {
  isUploadRequestContentLengthTooLarge,
  isUploadRequestTextTooLarge,
  REPORT_ARTIFACT_UPLOAD_MAX_BYTES,
  uploadRequestTooLargeResponse,
} from "../../helpers/uploadPayloadValidation";

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    if (isUploadRequestContentLengthTooLarge(request, REPORT_ARTIFACT_UPLOAD_MAX_BYTES)) {
      return uploadRequestTooLargeResponse("Report artifact", REPORT_ARTIFACT_UPLOAD_MAX_BYTES);
    }

    const text = await request.text();
    if (isUploadRequestTextTooLarge(text, REPORT_ARTIFACT_UPLOAD_MAX_BYTES)) {
      return uploadRequestTooLargeResponse("Report artifact", REPORT_ARTIFACT_UPLOAD_MAX_BYTES);
    }

    const json = JSON.parse(text);
    const input = schema.parse(json);

    // Verify the report artifact exists and belongs to the user (non-admins are scoped to their own)
    let ownershipQuery = db
      .selectFrom("reportArtifact")
      .select(["id", "userId"])
      .where("id", "=", input.id);

    if (user.role !== "admin") {
      ownershipQuery = ownershipQuery.where("userId", "=", user.id);
    }

    const existing = await ownershipQuery.executeTakeFirst();

    if (!existing) {
      return new Response(
        JSON.stringify({ error: "Report artifact not found or access denied" }),
        { status: 404 }
      );
    }

    // Prepare update object with only defined fields.
    // We avoid an explicit Partial<...> annotation here because Kysely's UpdateObject
    // type is stricter than a plain Partial and causes TS2769 when the types don't
    // align exactly (e.g. Json vs Record<string, unknown>).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {};
    const data = jsonRecord(input.data);

    if (input.reportDate !== undefined) updateData.reportDate = input.reportDate;
    if (input.artifactType !== undefined) updateData.artifactType = input.artifactType;
    if (input.data !== undefined) updateData.data = input.data;
    if (input.storageUrl !== undefined) {
      updateData.storageUrl = await normalizeReportArtifactStorageUrlForWrite({
        storageUrl: input.storageUrl,
        userId: existing.userId ?? user.id,
        fileName: typeof data.fileName === "string" ? data.fileName : undefined,
        mimeType: typeof data.mimeType === "string" ? data.mimeType : input.artifactType,
        sha256: input.sha256,
      });
    }
    if (input.sha256 !== undefined) updateData.sha256 = input.sha256;
    if (input.expiresAt !== undefined) updateData.expiresAt = input.expiresAt;

    if (Object.keys(updateData).length === 0) {
      // Nothing to update, fetch current state
      const current = await db
        .selectFrom("reportArtifact")
        .selectAll()
        .where("id", "=", input.id)
        .executeTakeFirstOrThrow();
      return new Response(JSON.stringify({ artifact: current } satisfies OutputType));
    }

    let updateQuery = db
      .updateTable("reportArtifact")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set(updateData as any)
      .where("id", "=", input.id);

    if (user.role !== "admin") {
      updateQuery = updateQuery.where("userId", "=", user.id);
    }

    const result = await updateQuery
      .returningAll()
      .executeTakeFirstOrThrow();

    return new Response(JSON.stringify({ artifact: result } satisfies OutputType));
  } catch (error) {
    console.error("Error updating report artifact:", error);
    return handleEndpointError(error);
  }
}
