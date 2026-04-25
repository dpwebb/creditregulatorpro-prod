import { db } from "./db";
import { Json } from "./schema";
import CryptoJS from "crypto-js";
import { SSEEvent, createHeartbeat } from "./sseStreamBuilder";

export interface CreateArtifactInput {
  userId: number;
  organizationId: number | null;
  bytesBase64: string;
  fileName: string;
  mimeType: string;
  region: string;
}

export interface CreateArtifactResult {
  artifactId: number;
  sha256: string;
}

/**
 * Creates a report artifact record with SHA256 hashing.
 * 
 * This function performs CPU-intensive SHA256 hashing, so it should be called
 * after yielding the event loop (await Promise.resolve()) to ensure SSE chunks
 * are flushed.
 * 
 * It also handles large database writes which might time out without heartbeats.
 */
export async function createReportArtifact(
  input: CreateArtifactInput,
  sendSSE?: (event: SSEEvent) => void
): Promise<CreateArtifactResult> {
    const sha256 = CryptoJS.SHA256(input.bytesBase64).toString(CryptoJS.enc.Hex);

  if (sendSSE) {
    sendSSE({
      type: "progress",
      stage: "creating_artifact_writing",
      message: "Saving file content...",
    });
  }

  // Calculate expiration
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  // Setup heartbeat for long DB write
  let heartbeatInterval: NodeJS.Timeout | null = null;
  
  if (sendSSE) {
    heartbeatInterval = setInterval(() => {
      sendSSE(createHeartbeat());
    }, 4000); // Send heartbeat every 4 seconds
  }

  try {
    // Create the artifact record with initial data
    const artifactRecord = await db
      .insertInto("reportArtifact")
      .values({
        userId: input.userId,
        organizationId: input.organizationId,
        artifactType: "credit_report",
        storageUrl: input.bytesBase64, // Store base64 directly
        sha256: sha256,
        reportDate: now,
        expiresAt: expiresAt,
        region: input.region,
        processingStatus: "pending",
        data: JSON.parse(JSON.stringify({
          fileName: input.fileName,
          mimeType: input.mimeType,
        })) as Json,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();

    console.log(`[createReportArtifact] Created artifact record with ID: ${artifactRecord.id}`);

    return {
      artifactId: artifactRecord.id,
      sha256: sha256,
    };
  } finally {
    // Always clear the interval
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
  }
}