import { OutputType, schema } from "./list_GET.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { maskAccountNumber } from "../../helpers/disputePacketTemplate";
import { logger } from "../../helpers/logger";
import {
  reportArtifactFileNameSelection,
  reportArtifactStorageReferenceSelections,
} from "../../helpers/reportArtifactListQuery";
import { getReportArtifactListStorageAvailability } from "../../helpers/reportArtifactStorage";

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
      reportArtifactFileNameSelection(),
      ...reportArtifactStorageReferenceSelections(),
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

    // linkedAccountCount comes back as a string from pg COUNT aggregate; coerce to number.
    const artifacts = await Promise.all(rawArtifacts.map(async (row) => {
      const {
        storageUrl: _storageUrl,
        hasStorageReference,
        has_storage_reference: hasStorageReferenceSnake,
        storageObjectName,
        storage_object_name: storageObjectNameSnake,
        data: _data,
        tradelineAccountNumber,
        ...safeRow
      } = row as typeof row & {
        storageUrl?: string | null;
        hasStorageReference?: boolean | null;
        has_storage_reference?: boolean | null;
        storageObjectName?: string | null;
        storage_object_name?: string | null;
        data?: unknown;
        tradelineAccountNumber?: string | null;
      };
      const storageAvailability = await getReportArtifactListStorageAvailability({
        hasStorageReference: hasStorageReference ?? hasStorageReferenceSnake,
        storageObjectName: storageObjectName ?? storageObjectNameSnake,
      });
      if (storageAvailability.status !== "available") {
        logger.warn(
          storageAvailability.failureReason === "not_found"
            ? "storage_read_failed:not_found"
            : "storage_read_failed",
          {
            artifactId: safeRow.id,
            artifactUserId: safeRow.userId,
            requestUserId: user.id,
            storageKey: storageAvailability.objectName,
            failureReason: storageAvailability.failureReason,
            endpoint: "report-artifact/list",
          }
        );
      }

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
        storageStatus: storageAvailability.status,
      };
    }));

    return Response.json({ artifacts, total } satisfies OutputType);
  } catch (error) {
    return handleEndpointError(error);
  }
}
