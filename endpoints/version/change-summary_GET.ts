import { ChangeSummaryOutput, ChangeSummaryItem } from "./change-summary_GET.schema";

import { db } from "../../helpers/db";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { BusinessRuleError, handleEndpointError } from "../../helpers/endpointErrorHandler";
import {
  TRACKED_ENTITY_TYPES,
  getOperationLevel,
  calculateNextSemVer,
  SemVerLevel,
} from "../../helpers/versionCalculator";
import { AuditEntityType } from "../../helpers/schema";
import { buildCurrentSnapshot, computeSnapshotDiff, DetailedSnapshot } from "../../helpers/versionSnapshotDiff";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      throw new BusinessRuleError("Admin access required", 403);
    }

    const lastReleasedVersion = await db
      .selectFrom("softwareVersion")
      .select(["version", "releasedAt", "systemSnapshot"])
      .where("status", "=", "released")
      .orderBy("releasedAt", "desc")
      .executeTakeFirst();

    const cutoffDate = lastReleasedVersion?.releasedAt ?? new Date(0);
    const lastVersionString = lastReleasedVersion?.version ?? "0.0.0";

    const trackedEntityTypes = TRACKED_ENTITY_TYPES as readonly AuditEntityType[];
    const auditLogs = await db
      .selectFrom("auditLog")
      .select(["actionType", "entityType", db.fn.count<number>("id").as("count")])
      .where("entityType", "in", trackedEntityTypes)
      .where("timestamp", ">=", cutoffDate)
      .groupBy(["actionType", "entityType"])
      .execute();

    const changes: ChangeSummaryItem[] = [];
    let highestLevel: SemVerLevel | "none" = "none";
    let totalOperations = 0;

    for (const log of auditLogs) {
      const level = getOperationLevel(log.entityType, log.actionType);
      if (!level) continue;

      const count = Number(log.count);
      if (count <= 0) continue;

      changes.push({
        entityType: log.entityType,
        actionType: log.actionType,
        count,
        level,
      });
      highestLevel = mergeHighestLevel(highestLevel, level);
      totalOperations += count;
    }

    const previousSnapshot = (lastReleasedVersion?.systemSnapshot as unknown as DetailedSnapshot | null) ?? null;
    const currentSnapshot = await buildCurrentSnapshot();
    const snapshotDiff = computeSnapshotDiff(previousSnapshot, currentSnapshot);

    console.log(
      `Snapshot diff summary: totalAdded=${snapshotDiff.summary.totalAdded}, totalRemoved=${snapshotDiff.summary.totalRemoved}, totalChanged=${snapshotDiff.summary.totalChanged}`
    );

    for (const [diffCategory, diff] of Object.entries(snapshotDiff.entityDiffs)) {
      const diffEntityType = `${diffCategory.toUpperCase()}_DIFF`;

      if (diff.added.length > 0) {
        const count = diff.added.length;
        changes.push({
          entityType: diffEntityType,
          actionType: "DIFF_ADDED",
          count,
          level: "MINOR",
        });
        highestLevel = mergeHighestLevel(highestLevel, "MINOR");
        totalOperations += count;
      }

      if (diff.removed.length > 0) {
        const count = diff.removed.length;
        changes.push({
          entityType: diffEntityType,
          actionType: "DIFF_REMOVED",
          count,
          level: "MAJOR",
        });
        highestLevel = mergeHighestLevel(highestLevel, "MAJOR");
        totalOperations += count;
      }

      if (diff.changed.length > 0) {
        const count = diff.changed.length;
        changes.push({
          entityType: diffEntityType,
          actionType: "DIFF_CHANGED",
          count,
          level: "PATCH",
        });
        highestLevel = mergeHighestLevel(highestLevel, "PATCH");
        totalOperations += count;
      }
    }

    const suggestedVersion =
      highestLevel === "none"
        ? lastVersionString
        : calculateNextSemVer(lastVersionString, highestLevel);

    console.log(
      `Change summary: lastVersion=${lastVersionString}, highestLevel=${highestLevel}, suggestedVersion=${suggestedVersion}, totalOperations=${totalOperations}, changeRows=${changes.length}`
    );

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

function mergeHighestLevel(
  current: SemVerLevel | "none",
  incoming: SemVerLevel
): SemVerLevel {
  if (current === "MAJOR" || incoming === "MAJOR") return "MAJOR";
  if (current === "MINOR" || incoming === "MINOR") return "MINOR";
  return "PATCH";
}
