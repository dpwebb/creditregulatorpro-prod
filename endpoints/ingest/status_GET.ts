import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import {
  getIngestProcessingWorkerLivenessReadOnly,
  getLatestIngestProcessingJobForArtifactReadOnly,
} from "../../helpers/ingestProcessingQueueService";
import { buildIngestUploadStatusView } from "../../helpers/ingestUploadStatusPresenter";
import { schema, type OutputType } from "./status_GET.schema";

type ProcessArtifactStatusRow = {
  id: number;
  userId: number | null;
  processingStatus: string | null;
};

const STATUS_JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;

export async function handle(request: Request) {
  try {
    const url = new URL(request.url);
    const input = schema.parse({
      artifactId: url.searchParams.get("artifactId"),
    });
    const { user } = await getServerUserSession(request);

    const artifact = await db
      .selectFrom("reportArtifact")
      .select(["id", "userId", "processingStatus"])
      .where("id", "=", input.artifactId)
      .executeTakeFirst() as ProcessArtifactStatusRow | undefined;

    if (!artifact) {
      return new Response(JSON.stringify({ error: "Artifact not found" }), { status: 404, headers: STATUS_JSON_HEADERS });
    }

    if (artifact.userId !== user.id) {
      return new Response(JSON.stringify({ error: "Unauthorized access to artifact" }), { status: 403, headers: STATUS_JSON_HEADERS });
    }

    let latestJob: Awaited<ReturnType<typeof getLatestIngestProcessingJobForArtifactReadOnly>> = null;
    try {
      latestJob = await getLatestIngestProcessingJobForArtifactReadOnly(input.artifactId);
    } catch {
      console.warn("Ingest status queue lookup failed; returning artifact-scoped status only.");
    }
    const view = buildIngestUploadStatusView({
      artifactId: input.artifactId,
      artifactProcessingStatus: artifact.processingStatus,
      job: latestJob && latestJob.userId === user.id ? latestJob : null,
      workerLiveness: latestJob ? await getIngestProcessingWorkerLivenessReadOnly({ source: latestJob.source }) : null,
    });

    return new Response(JSON.stringify(view satisfies OutputType), { headers: STATUS_JSON_HEADERS });
  } catch (error) {
    return handleEndpointError(error);
  }
}
