import { OutputType, schema } from "./detect-changes_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { detectSnapshotChanges } from "../../helpers/changeDetector";
import {
  ensureInitialSnapshot,
  getLatestTwoSnapshots,
} from "../../helpers/tradelineSnapshotManager";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const json = JSON.parse(await request.text());
    const { tradelineId } = schema.parse(json);

    // Verify tradeline ownership for non-admin users
    const isAdmin = user.role === "admin" || user.role === "support";
    const tradeline = await db
      .selectFrom("tradeline")
      .select(["id", "userId"])
      .where("id", "=", tradelineId)
      .executeTakeFirst();

    if (!tradeline) {
      return new Response(
        JSON.stringify({ error: "Tradeline not found" }),
        { status: 404 }
      );
    }

    if (!isAdmin && tradeline.userId !== user.id) {
      throw new BusinessRuleError("Not authorized", 403);
    }

    // 1. Ensure at least one baseline snapshot exists (backward compatibility)
    await ensureInitialSnapshot(tradelineId);

    // 2. Fetch the two most recent snapshots
    const { current, previous } = await getLatestTwoSnapshots(tradelineId);

    if (!current || !previous) {
      return new Response(
        JSON.stringify({
          changes: [],
          obligationsUnlocked: 0,
          summary:
            "Insufficient snapshots to detect drift (need at least 2).",
        } satisfies OutputType)
      );
    }

    // 3. Detect changes between the two snapshots
    const diffs = detectSnapshotChanges(previous, current);

    // 4. Filter for significant changes only
    const significantDiffs = diffs.filter((d) => d.severity !== "INFO");

    const allChanges: typeof diffs = [];
    let obligationsUnlocked = 0;

    if (significantDiffs.length > 0) {
      // 5. Log changes, checking for duplicates first
      for (const diff of significantDiffs) {
        const existingLog = await db
          .selectFrom("obligationChallengeLog")
          .select("id")
          .where("tradelineId", "=", tradelineId)
          .where("fieldName", "=", diff.fieldName)
          .where("actualValue", "=", String(diff.newValue))
          .executeTakeFirst();

        if (!existingLog) {
          await db
            .insertInto("obligationChallengeLog")
            .values({
              tradelineId,
              fieldName: diff.fieldName,
              expectedValue: String(diff.oldValue),
              actualValue: String(diff.newValue),
              severity: diff.severity,
              message: diff.message,
              challengeBasis: "DATA_DRIFT",
              deficiencies: `Inconsistent reporting detected between snapshot ${previous.id} and snapshot ${current.id}`,
              timingDriftDays:
                diff.changeType === "TEMPORAL" ? diff.driftAmount ?? 0 : 0,
              detectedAt: new Date(),
              region: "CA",
              ruleCategory: "ACCURACY",
              sourceSnapshotId: previous.id,
              comparisonSnapshotId: current.id,
            })
            .execute();

          allChanges.push(diff);
        }
      }

      console.log(
        `Dispute workflow instance mutation is reset; recorded ${allChanges.length} change log(s) without escalating obligations.`
      );
    }

    return new Response(
      JSON.stringify({
        changes: allChanges,
        obligationsUnlocked,
        summary: `Analysis complete. ${allChanges.length} significant changes detected. ${obligationsUnlocked} obligations escalated.`,
      } satisfies OutputType)
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}
