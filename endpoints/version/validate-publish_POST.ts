import { db } from "../../helpers/db";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { TRACKED_ENTITY_TYPES } from "../../helpers/versionCalculator";
import { schema, OutputType, CheckItem } from "./validate-publish_POST.schema";
import { AuditEntityType } from "../../helpers/schema";
import { buildCurrentSnapshot, computeSnapshotDiff, DetailedSnapshot } from "../../helpers/versionSnapshotDiff";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") throw new BusinessRuleError("Admin only endpoint", 403);

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    const version = await db
      .selectFrom("softwareVersion")
      .selectAll()
      .where("id", "=", input.versionId)
      .executeTakeFirst();

    if (!version) {
      throw new BusinessRuleError("Version not found", 404);
    }

    const checks: CheckItem[] = [];

    // 1. Release notes
    const hasReleaseNotes = Array.isArray(version.releaseNotes) && version.releaseNotes.length > 0;
    checks.push({
      id: "release_notes",
      label: "Release Notes",
      status: hasReleaseNotes ? "pass" : "fail",
      message: hasReleaseNotes ? "Release notes are present." : "Missing release notes.",
      required: true,
    });

    // 2. System snapshot
    const hasSnapshot = version.systemSnapshot !== null && version.systemSnapshot !== undefined;
    checks.push({
      id: "system_snapshot",
      label: "System Snapshot",
      status: hasSnapshot ? "pass" : "fail",
      message: hasSnapshot ? "System snapshot is present." : "Missing system snapshot.",
      required: true,
    });

    // 3. Version staged
    checks.push({
      id: "version_staged",
      label: "Version Status",
      status: version.status === "staged" ? "pass" : "fail",
      message:
        version.status === "staged"
          ? "Version is staged."
          : `Version status is '${version.status}', must be 'staged'.`,
      required: true,
    });

    // 4. Pending migrations
    const pendingMigrations = await db
      .selectFrom("versionMigration")
      .select(({ fn }) => fn.count<number>("id").as("count"))
      .where("versionId", "=", version.id)
      .where("status", "=", "pending")
      .executeTakeFirst();
    const pendingMigrationsCount = Number(pendingMigrations?.count) || 0;
    checks.push({
      id: "pending_migrations",
      label: "Pending Migrations",
      status: pendingMigrationsCount === 0 ? "pass" : "warning",
      message:
        pendingMigrationsCount === 0
          ? "No pending migrations."
          : `${pendingMigrationsCount} pending migration(s).`,
      required: false,
    });

    // 5. Critical issue reports
    const criticalIssues = await db
      .selectFrom("betaIssueReport")
      .select(({ fn }) => fn.count<number>("id").as("count"))
      .where("status", "=", "OPEN")
      .where("severity", "=", "CRITICAL")
      .executeTakeFirst();
    const criticalIssuesCount = Number(criticalIssues?.count) || 0;
    checks.push({
      id: "critical_beta_issues",
      label: "Critical Issue Reports",
      status: criticalIssuesCount === 0 ? "pass" : "warning",
      message:
        criticalIssuesCount === 0
          ? "No critical open issue reports."
          : `${criticalIssuesCount} critical open issue report(s).`,
      required: false,
    });

    // 6. Change logs
    // Audit logs are primary, but snapshot diff is used as a secondary signal
    // so the checklist reflects real config/data drift even when audit rows are sparse.
    const lastRelease = await db
      .selectFrom("softwareVersion")
      .select(["releasedAt", "systemSnapshot"])
      .where("status", "=", "released")
      .orderBy("releasedAt", "desc")
      .executeTakeFirst();

    const trackedEntityTypes = TRACKED_ENTITY_TYPES as readonly AuditEntityType[];
    let auditLogQuery = db
      .selectFrom("auditLog")
      .select(({ fn }) => fn.count<number>("id").as("count"))
      .where("entityType", "in", trackedEntityTypes);

    if (lastRelease && lastRelease.releasedAt) {
      auditLogQuery = auditLogQuery.where("timestamp", ">", lastRelease.releasedAt);
    }

    const auditLogs = await auditLogQuery.executeTakeFirst();
    const auditLogsCount = Number(auditLogs?.count) || 0;

    const targetSnapshot =
      ((version.systemSnapshot as unknown as DetailedSnapshot | null) ?? (await buildCurrentSnapshot()));
    const previousSnapshot =
      ((lastRelease?.systemSnapshot as unknown as DetailedSnapshot | null) ?? null);
    const snapshotDiff = computeSnapshotDiff(previousSnapshot, targetSnapshot);
    const snapshotChangesCount =
      snapshotDiff.summary.totalAdded +
      snapshotDiff.summary.totalRemoved +
      snapshotDiff.summary.totalChanged;

    const hasAuditChanges = auditLogsCount > 0;
    const hasSnapshotChanges = snapshotChangesCount > 0;

    let changeLogsStatus: "pass" | "warning" = "warning";
    let changeLogsMessage = "No change logs found since last release.";

    if (hasAuditChanges && hasSnapshotChanges) {
      changeLogsStatus = "pass";
      changeLogsMessage = `${auditLogsCount} audit change logs and ${snapshotChangesCount} snapshot changes found since last release.`;
    } else if (hasAuditChanges) {
      changeLogsStatus = "pass";
      changeLogsMessage = `${auditLogsCount} change logs found since last release.`;
    } else if (hasSnapshotChanges) {
      changeLogsStatus = "pass";
      changeLogsMessage = `No audit change logs found, but ${snapshotChangesCount} snapshot changes were detected since last release.`;
    }

    checks.push({
      id: "change_logs",
      label: "Change Logs",
      status: changeLogsStatus,
      message: changeLogsMessage,
      required: false,
    });

    // 7. Version locked
    checks.push({
      id: "version_locked",
      label: "Version Lock",
      status: !version.locked ? "pass" : "fail",
      message: !version.locked ? "Version is unlocked." : "Version is locked and cannot be released.",
      required: true,
    });

    const canRelease = checks.every((c) => !c.required || c.status === "pass");

    return new Response(JSON.stringify({ checks, canRelease } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}
