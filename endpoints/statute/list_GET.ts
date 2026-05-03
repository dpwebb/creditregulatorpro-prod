import { schema, OutputType } from "./list_GET.schema";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { sql } from "kysely";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import {
  buildCitation,
  deriveTopic,
  getLifecycleStatus,
  normalizeForExactMatch,
  type StatuteVersionLike,
} from "../../helpers/statuteClassification";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    console.log(`statute/list_GET called by user ${user.id}`);

    const url = new URL(request.url);
    const jurisdiction = url.searchParams.get("jurisdiction") || undefined;
    const code = url.searchParams.get("code") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const topic = url.searchParams.get("topic") || undefined;
    const citation = url.searchParams.get("citation") || undefined;
    const includeSuperseded = url.searchParams.get("includeSuperseded") === "true";
    const searchText = url.searchParams.get("searchText") || undefined;

    // Validate input using schema
    const input = schema.parse({
      jurisdiction,
      code,
      status,
      topic,
      citation,
      includeSuperseded,
      searchText
    });

    // Build the main query with counts
    let query = db
      .selectFrom("statute")
      .innerJoin("statuteVersion", "statute.id", "statuteVersion.statuteId")
      .leftJoin("packet", "statuteVersion.id", "packet.statuteVersionId")
      .leftJoin("packetComplianceAudit", "statuteVersion.id", "packetComplianceAudit.statuteVersionId")
      .select([
        "statute.id",
        "statute.jurisdiction",
        "statute.code",
        "statuteVersion.id as versionId",
        "statuteVersion.version",
        "statuteVersion.description",
        "statuteVersion.effectiveDate",
        "statuteVersion.supersededDate",
        "statuteVersion.responseClockDays",
        "statuteVersion.sourceUrl",
        "statuteVersion.sectionReference",
        "statuteVersion.createdAt",
        sql<number>`COUNT(DISTINCT ${sql.ref("packet.id")})`.as("packetCount"),
        sql<number>`COUNT(DISTINCT ${sql.ref("packetComplianceAudit.obligationId")})`.as("obligationCount"),
      ])
      .groupBy([
        "statute.id",
        "statute.jurisdiction",
        "statute.code",
        "statuteVersion.id",
        "statuteVersion.version",
        "statuteVersion.description",
        "statuteVersion.effectiveDate",
        "statuteVersion.supersededDate",
        "statuteVersion.responseClockDays",
        "statuteVersion.sourceUrl",
        "statuteVersion.sectionReference",
        "statuteVersion.createdAt",
      ]);

    // Filter by jurisdiction/code on statute table
    if (input.jurisdiction) {
      query = query.where("statute.jurisdiction", "=", input.jurisdiction);
    }

    if (input.code) {
      query = query.where("statute.code", "=", input.code);
    }

    // Filter by superseded_date on statute_version table
    if (!input.includeSuperseded && input.status !== "AMENDED" && input.status !== "REPEALED") {
      query = query.where("statuteVersion.supersededDate", "is", null);
    }

    // Text search across description and sectionReference
    if (input.searchText) {
      const searchPattern = `%${input.searchText}%`;
      query = query.where((eb) =>
        eb.or([
          eb("statute.code", "ilike", searchPattern),
          eb("statute.jurisdiction", "ilike", searchPattern),
          eb("statuteVersion.description", "ilike", searchPattern),
          eb("statuteVersion.sectionReference", "ilike", searchPattern),
        ])
      );
    }

    // Order by jurisdiction, code, version DESC
    query = query
      .orderBy("statute.jurisdiction", "asc")
      .orderBy("statute.code", "asc")
      .orderBy("statuteVersion.version", "desc");

    const results = await query.execute();

    const versionRows: StatuteVersionLike[] = results.map((row) => ({
      statuteId: row.id,
      versionId: row.versionId,
      version: row.version,
      code: row.code,
      description: row.description,
      sectionReference: row.sectionReference,
      effectiveDate: row.effectiveDate ? new Date(row.effectiveDate) : null,
      supersededDate: row.supersededDate ? new Date(row.supersededDate) : null,
    }));

    const byStatuteId = new Map<number, StatuteVersionLike[]>();
    for (const row of versionRows) {
      const existing = byStatuteId.get(row.statuteId);
      if (existing) {
        existing.push(row);
      } else {
        byStatuteId.set(row.statuteId, [row]);
      }
    }

    const auditLogs = await db
      .selectFrom("auditLog")
      .select(["entityId", "details", "timestamp"])
      .where("entityType", "=", "STATUTE")
      .where("status", "=", "SUCCESS")
      .orderBy("timestamp", "desc")
      .limit(1000)
      .execute();

    const lastReviewedByVersionId = new Map<number, Date>();
    for (const log of auditLogs) {
      const details = (log.details ?? {}) as Record<string, unknown>;
      const rawVersionId = details.versionId ?? details.createdVersionId ?? details.targetVersionId;
      const versionId = typeof rawVersionId === "number" ? rawVersionId : null;
      if (!versionId) continue;
      if (!lastReviewedByVersionId.has(versionId)) {
        lastReviewedByVersionId.set(
          versionId,
          log.timestamp instanceof Date ? log.timestamp : new Date(log.timestamp)
        );
      }
    }

    // Convert counts to numbers
    let statutes = results.map(row => {
      const versionsForStatute = byStatuteId.get(row.id) || [];
      const lifecycleStatus = getLifecycleStatus(
        {
          statuteId: row.id,
          versionId: row.versionId,
          version: row.version,
          code: row.code,
          description: row.description,
          sectionReference: row.sectionReference,
          effectiveDate: row.effectiveDate ? new Date(row.effectiveDate) : null,
          supersededDate: row.supersededDate ? new Date(row.supersededDate) : null,
        },
        versionsForStatute
      );
      const citationText = buildCitation(row.code, row.sectionReference);
      const topicLabel = deriveTopic(row.code, row.description);
      return {
        ...row,
        packetCount: Number(row.packetCount),
        obligationCount: Number(row.obligationCount),
        lifecycleStatus,
        topic: topicLabel,
        citation: citationText,
        lastReviewedAt: lastReviewedByVersionId.get(row.versionId) ?? null,
      };
    });

    if (input.status) {
      statutes = statutes.filter((row) => row.lifecycleStatus === input.status);
    }

    if (input.topic) {
      statutes = statutes.filter((row) => row.topic === input.topic);
    }

    if (input.citation) {
      const needle = normalizeForExactMatch(input.citation);
      statutes = statutes.filter((row) => normalizeForExactMatch(row.citation) === needle);
    }

    return new Response(JSON.stringify({ statutes } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}
