import { db } from "./db";

/**
 * Updates the processingStatus column on a reportArtifact row.
 */
export async function updateArtifactProcessingStatus(
  artifactId: number,
  status: string
): Promise<void> {
  await db
    .updateTable("reportArtifact")
    .set({ processingStatus: status })
    .where("id", "=", artifactId)
    .execute();
}