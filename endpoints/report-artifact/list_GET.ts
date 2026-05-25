import { OutputType, schema } from "./list_GET.schema";

import { sql } from "kysely";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { maskAccountNumber } from "../../helpers/disputePacketTemplate";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    const url = new URL(request.url);
    const validatedInput = schema.parse({
      limit: url.searchParams.get('limit') ?? undefined,
      offset: url.searchParams.get('offset') ?? undefined,
    });

    const buildBaseQuery = () =>
      db
        .selectFrom("reportArtifact")
        .leftJoin("tradeline", "tradeline.id", "reportArtifact.tradelineId")
        .where("reportArtifact.region", "=", "CA");

    // Count query
    let countQuery = buildBaseQuery().select((eb) => eb.fn.countAll<string>().as('total'));
    if (user.role !== 'admin') {
      countQuery = countQuery
        .where('reportArtifact.userId', '=', user.id);
    }
    const countResult = await countQuery.executeTakeFirstOrThrow();
    const total = parseInt(countResult.total, 10);

    // Data query
    let dataQuery = buildBaseQuery().select((eb) => [
      "reportArtifact.id",
      "reportArtifact.artifactType",
      "reportArtifact.reportDate",
      "reportArtifact.metro2Version",
      "reportArtifact.sha256",
      "reportArtifact.createdAt",
      "reportArtifact.userId",
      "reportArtifact.organizationId",
      "reportArtifact.region",
      "reportArtifact.tradelineId",
      "reportArtifact.crrgYear",
      "reportArtifact.expiresAt",
      "reportArtifact.validationRulesApplied",
      "reportArtifact.processingStatus",
      sql<string | null>`"reportArtifact"."data" ->> 'fileName'`.as("fileName"),
      "tradeline.accountNumber as tradelineAccountNumber",
      "tradeline.accountType as tradelineAccountType",
      // Subquery: count tradelines linked to this artifact via report_artifact_id
      eb
        .selectFrom("tradeline as tl_count")
        .select((eb2) => eb2.fn.countAll<string>().as("cnt"))
        .whereRef("tl_count.reportArtifactId", "=", "reportArtifact.id")
        .as("linkedAccountCount"),
      // Subquery: get bureau name from first tradeline linked to this artifact
      eb
        .selectFrom("tradeline as tl_bureau")
        .innerJoin("bureau", "bureau.id", "tl_bureau.bureauId")
        .select("bureau.name")
        .whereRef("tl_bureau.reportArtifactId", "=", "reportArtifact.id")
        .limit(1)
        .as("bureauName"),
    ]);

    if (user.role !== 'admin') {
      dataQuery = dataQuery
        .where('reportArtifact.userId', '=', user.id);
    }

    dataQuery = dataQuery.orderBy("reportArtifact.createdAt", "desc");

    dataQuery = dataQuery.limit(validatedInput.limit);
    if (validatedInput.offset !== undefined) {
      dataQuery = dataQuery.offset(validatedInput.offset);
    }

    const rawArtifacts = await dataQuery.execute();

    // linkedAccountCount comes back as a string from pg COUNT aggregate; coerce to number
    const artifacts = rawArtifacts.map((row) => {
      const {
        storageUrl: _storageUrl,
        data: _data,
        tradelineAccountNumber,
        ...safeRow
      } = row as typeof row & {
        storageUrl?: unknown;
        data?: unknown;
        tradelineAccountNumber?: string | null;
      };
      return {
        ...safeRow,
        tradelineAccountNumber: tradelineAccountNumber
          ? maskAccountNumber(tradelineAccountNumber)
          : null,
        linkedAccountCount:
          row.linkedAccountCount != null
            ? parseInt(row.linkedAccountCount as unknown as string, 10)
            : null,
        bureauName: row.bureauName ?? null,
      };
    });

    return new Response(JSON.stringify({ artifacts, total } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}
