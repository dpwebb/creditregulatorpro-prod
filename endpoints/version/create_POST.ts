import { db } from "../../helpers/db";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import {
  TRACKED_ENTITY_TYPES,
  determineHighestLevel,
  calculateNextSemVer,
  bumpPatchVersion,
  SemVerLevel,
} from "../../helpers/versionCalculator";
import { schema, OutputType } from "./create_POST.schema";
import { AuditEntityType } from "../../helpers/schema";

/**
 * Finds the next available version string starting from `candidate`,
 * incrementing the patch number until no existing non-draft version blocks it.
 * If the candidate matches an existing draft, returns that draft (idempotent).
 * If the candidate matches a released/locked version, bumps patch until free.
 */
async function findAvailableVersion(candidate: string): Promise<{ version: string; existingDraftId: number | null }> {
  let current = candidate;
  for (;;) {
    const existing = await db
      .selectFrom("softwareVersion")
      .select(["id", "status", "locked"])
      .where("version", "=", current)
      .executeTakeFirst();

    if (!existing) {
      return { version: current, existingDraftId: null };
    }

    if (existing.status === "draft" && !existing.locked) {
      console.log(`Auto-versioning: version ${current} already exists as a draft, returning existing draft id=${existing.id}`);
      return { version: current, existingDraftId: existing.id };
    }

    // Released or locked — bump patch
    const next = bumpPatchVersion(current);
    console.log(`Auto-versioning: version ${current} is taken (status=${existing.status}, locked=${existing.locked}), trying ${next}`);
    current = next;
  }
}

async function resolveVersion(manualVersion: string | undefined): Promise<string> {
  if (manualVersion) {
    return manualVersion;
  }

  // Look up the last released version
  const lastReleasedVersion = await db
    .selectFrom("softwareVersion")
    .select(["version", "releasedAt"])
    .where("status", "=", "released")
    .orderBy("releasedAt", "desc")
    .executeTakeFirst();

  if (!lastReleasedVersion) {
    console.log("No previous released version found, defaulting to 1.0.0");
    return "1.0.0";
  }

  const lastVersionString = lastReleasedVersion.version;
  const cutoffDate = lastReleasedVersion.releasedAt ?? new Date(0);

  // Query audit_log for all tracked entity types since last release
  const trackedEntityTypes = TRACKED_ENTITY_TYPES as readonly AuditEntityType[];
  const auditLogs = await db
    .selectFrom("auditLog")
    .select(["actionType", "entityType", db.fn.count<number>("id").as("count")])
    .where("entityType", "in", trackedEntityTypes)
    .where("timestamp", ">=", cutoffDate)
    .groupBy(["actionType", "entityType"])
    .execute();

  // Build operations list for determineHighestLevel
  const operations: { entityType: string; actionType: string }[] = [];
  for (const log of auditLogs) {
    const count = Number(log.count);
    for (let i = 0; i < count; i++) {
      operations.push({ entityType: log.entityType, actionType: log.actionType });
    }
  }

  const highestLevel = determineHighestLevel(operations);

  if (highestLevel === "none") {
    const fallbackVersion = bumpPatchVersion(lastVersionString);
    console.log(
      `Auto-versioning fallback: no tracked audit-log changes found since ${cutoffDate.toISOString()}, bumping patch ${lastVersionString} -> ${fallbackVersion}`
    );
    return fallbackVersion;
  }

  const nextVersion = calculateNextSemVer(lastVersionString, highestLevel as SemVerLevel);

  console.log(
    `Auto-versioning via SemVer: ${lastVersionString} -> ${nextVersion} (highestLevel=${highestLevel}, totalOperations=${operations.length})`
  );

  return nextVersion;
}

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") throw new BusinessRuleError("Admin only endpoint", 403);

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    const isManualVersion = !!input.version;
    const resolvedVersion = await resolveVersion(input.version);

    if (isManualVersion) {
      // Manual version: keep strict duplicate check
      const existing = await db
        .selectFrom("softwareVersion")
        .select("id")
        .where("version", "=", resolvedVersion)
        .executeTakeFirst();

      if (existing) {
        throw new BusinessRuleError(`Version ${resolvedVersion} already exists`, 400);
      }

      const result = await db
        .insertInto("softwareVersion")
        .values({
          version: resolvedVersion,
          codename: input.codename ?? null,
          status: "draft",
          locked: false,
          createdBy: user.id,
          codeLineCount: input.codeLineCount ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return new Response(JSON.stringify(result satisfies OutputType));
    }

    // Auto-versioning: find available version with idempotent draft handling
    const { version: availableVersion, existingDraftId } = await findAvailableVersion(resolvedVersion);

    if (existingDraftId !== null) {
      const existingDraft = await db
        .selectFrom("softwareVersion")
        .selectAll()
        .where("id", "=", existingDraftId)
        .executeTakeFirstOrThrow();

      return new Response(JSON.stringify(existingDraft satisfies OutputType));
    }

    const result = await db
      .insertInto("softwareVersion")
      .values({
        version: availableVersion,
        codename: input.codename ?? null,
        status: "draft",
        locked: false,
        createdBy: user.id,
        codeLineCount: input.codeLineCount ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return new Response(JSON.stringify(result satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}
