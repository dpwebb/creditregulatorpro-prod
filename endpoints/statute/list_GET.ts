import { schema, OutputType } from "./list_GET.schema";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { sql } from "kysely";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    console.log(`statute/list_GET called by user ${user.id}`);

    const url = new URL(request.url);
    const jurisdiction = url.searchParams.get("jurisdiction") || undefined;
    const code = url.searchParams.get("code") || undefined;
    const includeSuperseded = url.searchParams.get("includeSuperseded") === "true";
    const searchText = url.searchParams.get("searchText") || undefined;

    // Validate input using schema
    const input = schema.parse({
      jurisdiction,
      code,
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
    if (!input.includeSuperseded) {
      query = query.where("statuteVersion.supersededDate", "is", null);
    }

    // Text search across description and sectionReference
    if (input.searchText) {
      const searchPattern = `%${input.searchText}%`;
      query = query.where((eb) =>
        eb.or([
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

    // Convert counts to numbers
    const statutes = results.map(row => ({
      ...row,
      packetCount: Number(row.packetCount),
      obligationCount: Number(row.obligationCount),
    }));

    return new Response(JSON.stringify({ statutes } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}