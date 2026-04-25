import { schema, OutputType, ReleaseNoteCategorySchema } from "./generate-notes_POST.schema";

import { db } from "../../helpers/db";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { BusinessRuleError, handleEndpointError } from "../../helpers/endpointErrorHandler";
import { checkRateLimit, RateLimitConfig } from "../../helpers/rateLimiter";
import { TRACKED_ENTITY_TYPES } from "../../helpers/versionCalculator";
import { buildCurrentSnapshot, computeSnapshotDiff, SnapshotDiffResult } from "../../helpers/versionSnapshotDiff";
import { z } from "zod";
import { AuditEntityType } from "../../helpers/schema";

interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{ text?: string }>;
    };
  }>;
  error?: { message: string };
}

/**
 * Renders the snapshot diff result into a human-readable string for the Gemini prompt.
 */
function buildSnapshotDiffSummary(diff: SnapshotDiffResult): string {
  const lines: string[] = [];

  for (const [entityName, entityDiff] of Object.entries(diff.entityDiffs)) {
    const { added, removed, changed } = entityDiff;
    if (added.length === 0 && removed.length === 0 && changed.length === 0) continue;

    lines.push(`Entity: ${entityName}`);
    if (added.length > 0) {
      lines.push(`  Added (${added.length}): ${added.join(", ")}`);
    }
    if (removed.length > 0) {
      lines.push(`  Removed (${removed.length}): ${removed.join(", ")}`);
    }
    if (changed.length > 0) {
      lines.push(`  Changed (${changed.length}): ${changed.join("; ")}`);
    }
  }

  if (lines.length === 0) {
    return "(No snapshot-level entity changes detected)";
  }

  return lines.join("\n");
}

/**
 * Returns true if the diff has at least one meaningful change across all entity groups.
 */
function hasDiffChanges(diff: SnapshotDiffResult): boolean {
  return (
    diff.summary.totalAdded > 0 ||
    diff.summary.totalRemoved > 0 ||
    diff.summary.totalChanged > 0
  );
}

export async function handle(request: Request) {
  try {
    // 1. Auth check (admin only)
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      throw new BusinessRuleError("Admin access required", 403);
    }

    const rateLimitResult = await checkRateLimit(
      user.id.toString(),
      "AI_GENERATE_NOTES",
      RateLimitConfig.AI_GENERATE_NOTES.maxAttempts,
      RateLimitConfig.AI_GENERATE_NOTES.windowMinutes
    );
    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Please try again later.", resetAt: rateLimitResult.resetAt }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    const json = JSON.parse(await request.text());
    const { versionId } = schema.parse(json);

    // 2. Fetch the target version
    const targetVersion = await db
      .selectFrom("softwareVersion")
      .select(["id", "status", "createdAt"])
      .where("id", "=", versionId)
      .executeTakeFirst();

    if (!targetVersion) {
      throw new BusinessRuleError("Version not found", 404);
    }

    if (targetVersion.status !== "draft" && targetVersion.status !== "staged") {
      throw new BusinessRuleError("Release notes can only be generated for draft or staged versions", 400);
    }

    // 3. Find the last released or archived version (for cutoff date and previous snapshot)
    const lastReleasedVersion = await db
      .selectFrom("softwareVersion")
      .select(["releasedAt", "systemSnapshot"])
      .where("status", "in", ["released", "archived"])
      .orderBy("releasedAt", "desc")
      .executeTakeFirst();

    const cutoffDate = lastReleasedVersion?.releasedAt ?? targetVersion.createdAt;
    const previousSnapshot = lastReleasedVersion?.systemSnapshot ?? null;

    // 4. Fetch audit logs and build snapshot diff in parallel
    const trackedEntityTypes = TRACKED_ENTITY_TYPES as readonly AuditEntityType[];

    const [auditLogs, currentSnapshot] = await Promise.all([
      db
        .selectFrom("auditLog")
        .select(["actionType", "entityType", "entityId", "details", "status", "timestamp"])
        .where("entityType", "in", trackedEntityTypes)
        .where("timestamp", ">=", cutoffDate)
        .orderBy("timestamp", "asc")
        .limit(500)
        .execute(),
      buildCurrentSnapshot(),
    ]);

    // 5. Compute snapshot diff
    const snapshotDiff = computeSnapshotDiff(previousSnapshot, currentSnapshot);
    const diffHasChanges = hasDiffChanges(snapshotDiff);

    console.log(
      `[generate-notes] versionId=${versionId} auditLogs=${auditLogs.length} snapshotDiffChanges=add:${snapshotDiff.summary.totalAdded}/rm:${snapshotDiff.summary.totalRemoved}/chg:${snapshotDiff.summary.totalChanged}`
    );

    // 6. Fall back to "No Changes" only if BOTH sources have nothing
    if (auditLogs.length === 0 && !diffHasChanges) {
      const emptyNotes = [{ category: "No Changes", items: ["No substantive changes found since the last release."] }];
      await db
        .updateTable("softwareVersion")
        .set({ releaseNotes: emptyNotes, updatedAt: new Date() })
        .where("id", "=", versionId)
        .execute();
      return new Response(JSON.stringify({ releaseNotes: emptyNotes } satisfies OutputType));
    }

    // 7. Build audit log summaries
    const logSummaries =
      auditLogs.length > 0
        ? auditLogs
            .map(
              (log) =>
                `[${log.timestamp.toISOString()}] ${log.actionType} on ${log.entityType} ${log.entityId ? `(ID: ${log.entityId})` : ""} - Status: ${log.status}. Details: ${log.details ? JSON.stringify(log.details) : "None"}`
            )
            .join("\n")
        : "(No audit log entries found since the last release)";

    // 8. Build snapshot diff summary section
    const snapshotDiffSummary = buildSnapshotDiffSummary(snapshotDiff);

    // 9. Call Gemini 2.5 Flash API
    const apiKey = process.env.GOOGLE_GEMINI_SA_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_GEMINI_SA_KEY is not set");
    }

    const promptText = `
You are an expert technical writer generating software release notes for a development team.
You have two sources of information about what changed since the last release:

1. AUDIT LOGS — explicit action records from the system event log.
2. SNAPSHOT DIFF — a structural comparison of all tracked system entities (bureaus, statutes, obligations, feature flags, system settings, scanning rules, regulatory updates, etc.) between the previous and current release.

Merge and deduplicate insights from both sources. If the same change appears in both, mention it only once.

Categorize the changes into the following categories (only include a category if there are relevant entries):
- "System Changes" — for audit log entries with entityType SYSTEM (e.g., schema changes, feature additions/removals, system-level configuration updates, bug fixes)
- "Bureau Changes" — bureau additions, removals, or updates from either source
- "Compliance & Regulatory" — statute, obligation, enforcement mechanism, or regulatory update changes from either source
- "Platform Configuration" — feature flag changes and system setting changes detected by the snapshot diff
- "Rules & Scanning" — scanning rule additions, removals, or changes detected by the snapshot diff
- "Furnisher & Validation" — furnisher-related changes from audit log entries (FURNISHER, FURNISHER_OBLIGATION, FURNISHER_VALIDATION)

Write each item as a clear, concise release note sentence describing what changed. Do not reference raw action type names, entity type identifiers, or internal field names in the output text.

Respond ONLY with a JSON array in the following format:
[
  {
    "category": "Category Name",
    "items": [
      "Description of change 1",
      "Description of change 2"
    ]
  }
]

--- AUDIT LOGS ---
${logSummaries}

--- SNAPSHOT DIFF SUMMARY ---
${snapshotDiffSummary}
    `;

    const requestBody = {
      contents: [{ parts: [{ text: promptText }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API failed with status ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as GeminiResponse;

    if (data.error) {
      throw new Error(`Gemini API error: ${data.error.message}`);
    }

    const outputText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!outputText) {
      throw new Error("Gemini API returned empty response");
    }

    // 10. Parse the JSON from the Gemini response
    let parsedNotes;
    try {
      parsedNotes = JSON.parse(outputText);
      parsedNotes = z.array(ReleaseNoteCategorySchema).parse(parsedNotes);
    } catch (e) {
      console.error("Failed to parse Gemini output:", outputText);
      throw new BusinessRuleError("Failed to parse generated release notes into expected format", 500);
    }

    // 11. Save the release notes to the software_version record
    await db
      .updateTable("softwareVersion")
      .set({
        releaseNotes: parsedNotes,
        updatedAt: new Date(),
      })
      .where("id", "=", versionId)
      .execute();

    // 12. Return the generated release notes
    return new Response(JSON.stringify({ releaseNotes: parsedNotes } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}