import { ChangeSummaryOutput, ChangeSummaryItem } from "./change-summary_GET.schema";

import { db } from "../../helpers/db";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { BusinessRuleError, handleEndpointError } from "../../helpers/endpointErrorHandler";
import {
  TRACKED_ENTITY_TYPES,
  getOperationLevel,
  determineHighestLevel,
  calculateNextSemVer,
  SemVerLevel,
} from "../../helpers/versionCalculator";
import { AuditEntityType } from "../../helpers/schema";
import { buildCurrentSnapshot, computeSnapshotDiff, DetailedSnapshot } from "../../helpers/versionSnapshotDiff";

export async function handle(request: Request) {
  try {
    // 1. Auth check — admin only
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      throw new BusinessRuleError("Admin access required", 403);
    }

    // 2. Find the last released version's releasedAt and systemSnapshot
    const lastReleasedVersion = await db
      .selectFrom("softwareVersion")
      .select(["version", "releasedAt", "systemSnapshot"])
      .where("status", "=", "released")
      .orderBy("releasedAt", "desc")
      .executeTakeFirst();

    const cutoffDate = lastReleasedVersion?.releasedAt ?? new Date(0);
    const lastVersionString = lastReleasedVersion?.version ?? "0.0.0";

    // 3. Single query: select actionType, entityType, count grouped by both
    const trackedEntityTypes = TRACKED_ENTITY_TYPES as readonly AuditEntityType[];
    const auditLogs = await db
      .selectFrom("auditLog")
      .select(["actionType", "entityType", db.fn.count<number>("id").as("count")])
      .where("entityType", "in", trackedEntityTypes)
      .where("timestamp", ">=", cutoffDate)
      .groupBy(["actionType", "entityType"])
      .execute();

    // 4. For each row, call getOperationLevel; skip if null
    const changes: ChangeSummaryItem[] = [];
    const operations: { entityType: string; actionType: string }[] = [];

    for (const log of auditLogs) {
      const level = getOperationLevel(log.entityType, log.actionType);
      if (!level) continue;

      const count = Number(log.count);
      changes.push({
        entityType: log.entityType,
        actionType: log.actionType,
        count,
        level,
      });

      // Expand operations so determineHighestLevel counts each occurrence
      for (let i = 0; i < count; i++) {
        operations.push({ entityType: log.entityType, actionType: log.actionType });
      }
    }

    // 5. Build snapshot diff-based changes
    const [currentSnapshot] = await Promise.all([buildCurrentSnapshot()]);
    const previousSnapshot = lastReleasedVersion?.systemSnapshot as DetailedSnapshot | null ?? null;
    const snapshotDiff = computeSnapshotDiff(previousSnapshot, currentSnapshot);

    console.log(
      `Snapshot diff summary: totalAdded=${snapshotDiff.summary.totalAdded}, totalRemoved=${snapshotDiff.summary.totalRemoved}, totalChanged=${snapshotDiff.summary.totalChanged}`
    );

    // Map diff entity names to DIFF entity type keys
    for (const [diffCategory, diff] of Object.entries(snapshotDiff.entityDiffs)) {
      const diffEntityType = `${diffCategory.toUpperCase()}_DIFF`;

      if (diff.added.length > 0) {
        changes.push({
          entityType: diffEntityType,
          actionType: "DIFF_ADDED",
          count: diff.added.length,
          level: "MINOR",
        });
        for (let i = 0; i < diff.added.length; i++) {
          operations.push({ entityType: diffEntityType, actionType: "DIFF_ADDED" });
        }
      }

      if (diff.removed.length > 0) {
        changes.push({
          entityType: diffEntityType,
          actionType: "DIFF_REMOVED",
          count: diff.removed.length,
          level: "MAJOR",
        });
        for (let i = 0; i < diff.removed.length; i++) {
          operations.push({ entityType: diffEntityType, actionType: "DIFF_REMOVED" });
        }
      }

      if (diff.changed.length > 0) {
        changes.push({
          entityType: diffEntityType,
          actionType: "DIFF_CHANGED",
          count: diff.changed.length,
          level: "PATCH",
        });
        for (let i = 0; i < diff.changed.length; i++) {
          operations.push({ entityType: diffEntityType, actionType: "DIFF_CHANGED" });
        }
      }
    }

    // 6. Determine highestLevel from all operations (audit-log + diff-based)
    //    We need a custom determineHighestLevel that understands DIFF operations too
    const highestLevel = determineCombinedHighestLevel(operations);
    const suggestedVersion =
      highestLevel === "none"
        ? lastVersionString
        : calculateNextSemVer(lastVersionString, highestLevel as SemVerLevel);

    const totalOperations = operations.length;

    console.log(
      `Change summary: lastVersion=${lastVersionString}, highestLevel=${highestLevel}, suggestedVersion=${suggestedVersion}, totalOperations=${totalOperations}, changeRows=${changes.length}`
    );

    // 7. Return final output structure
    const output: ChangeSummaryOutput = {
      changes,
      highestLevel,
      suggestedVersion,
      lastReleasedVersion: lastReleasedVersion?.version ?? null,
      totalOperations,
    };

    return new Response(JSON.stringify(output satisfies ChangeSummaryOutput));
  } catch (error) {
    return handleEndpointError(error);
  }
}

/**
 * Determines the highest SemVer level from a combined list of operations,
 * including diff-based operations (DIFF_ADDED = MINOR, DIFF_REMOVED = MAJOR, DIFF_CHANGED = PATCH).
 */
function determineCombinedHighestLevel(
  operations: { entityType: string; actionType: string }[]
): SemVerLevel | "none" {
  let highest: SemVerLevel | "none" = "none";

  for (const op of operations) {
    let level: SemVerLevel | null = null;

    // Resolve diff-based operations directly
    if (op.actionType === "DIFF_ADDED") {
      level = "MINOR";
    } else if (op.actionType === "DIFF_REMOVED") {
      level = "MAJOR";
    } else if (op.actionType === "DIFF_CHANGED") {
      level = "PATCH";
    } else {
      level = getOperationLevel(op.entityType, op.actionType);
    }

    if (!level) continue;

    if (level === "MAJOR") return "MAJOR"; // Highest possible, early exit
    if (level === "MINOR" && highest !== "MINOR") highest = "MINOR";
    if (level === "PATCH" && highest === "none") highest = "PATCH";
  }

  return highest;
}