import { schema, OutputType } from "./list_GET.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { shouldSuppressStaleReportingViolation } from "../../helpers/staleReportingGuard";
import { sql } from "kysely";

function isOptionalSchemaError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (((error as { code?: unknown }).code === "42P01") || // undefined_table
      ((error as { code?: unknown }).code === "42703")) // undefined_column
  );
}

function toJsonSafe<T>(value: T): T {
  const seen = new WeakSet<object>();

  const visit = (input: any): any => {
    if (typeof input === "bigint") return input.toString();
    if (input === null || input === undefined) return input;
    if (typeof input !== "object") return input;
    if (input instanceof Date) return input;
    if (Array.isArray(input)) return input.map((item) => visit(item));
    if (seen.has(input)) return null;

    seen.add(input);
    const output: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(input)) {
      output[key] = visit(val);
    }
    return output;
  };

  return visit(value);
}

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    const url = new URL(request.url);
    const queryParams = {
      creditorId: url.searchParams.get('creditorId') ? Number(url.searchParams.get('creditorId')) : undefined,
      obligationState: url.searchParams.get('obligationState') || undefined,
      tradelineId: url.searchParams.get('tradelineId') ? Number(url.searchParams.get('tradelineId')) : undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      offset: url.searchParams.get('offset') ?? undefined,
    };

    const input = schema.parse(queryParams);

    const buildMinimalFallback = async (sourceError: unknown): Promise<OutputType> => {
      console.warn("[creditor-validation/list] falling back to minimal query", sourceError);

      const applyMinimalFilters = <T>(query: T & {
        where: (...args: any[]) => any;
      }) => {
        let filtered: any = query;
        if (input.creditorId !== undefined) {
          filtered = filtered.where('creditorObligationTest.creditorId', '=', input.creditorId);
        }
        if (input.obligationState !== undefined) {
          filtered = filtered.where('creditorObligationTest.obligationState', '=', input.obligationState as any);
        }
        if (input.tradelineId !== undefined) {
          filtered = filtered.where('creditorObligationTest.tradelineId', '=', input.tradelineId);
        }
        if (user.role !== 'admin') {
          filtered = filtered.where('tradeline.userId', '=', user.id);
        }
        return filtered;
      };

      const countResult = await applyMinimalFilters(
        db
          .selectFrom('creditorObligationTest')
          .innerJoin('tradeline', 'tradeline.id', 'creditorObligationTest.tradelineId')
          .where('creditorObligationTest.tradelineId', 'is not', null)
          .select((eb) => eb.fn.countAll<string>().as("total"))
      ).executeTakeFirst();

      let dataQuery = applyMinimalFilters(
        db
          .selectFrom('creditorObligationTest')
          .innerJoin('tradeline', 'tradeline.id', 'creditorObligationTest.tradelineId')
          .where('creditorObligationTest.tradelineId', 'is not', null)
          .selectAll('creditorObligationTest')
      )
        .orderBy('creditorObligationTest.detectedAt', 'desc')
        .orderBy('creditorObligationTest.createdAt', 'desc');

      if (input.limit !== undefined) {
        dataQuery = dataQuery.limit(input.limit);
        if (input.offset !== undefined) {
          dataQuery = dataQuery.offset(input.offset);
        }
      }

      const rows = await dataQuery.execute();
      const obligationTests = rows.map((row: any) => ({
        ...row,
        userStatus: typeof row.userStatus === "string" ? row.userStatus : "active",
        userStatusReason: row.userStatusReason ?? null,
        userStatusUpdatedAt: row.userStatusUpdatedAt ?? null,
        creditorName: null,
        tradelineAccountNumber: null,
        tradelineDisplayStatus: null,
        tradelineCurrentBalance: null,
        tradelineBalance: null,
        tradelineBureauName: null,
      }));

      return {
        obligationTests: obligationTests as any,
        total: parseInt(String(countResult?.total ?? "0"), 10),
      };
    };

    const buildBaseQuery = () =>
      db
        .selectFrom('creditorObligationTest')
        .leftJoin('creditor', 'creditor.id', 'creditorObligationTest.creditorId')
        .leftJoin('tradeline', 'tradeline.id', 'creditorObligationTest.tradelineId')
        .leftJoin('creditor as tradelineCreditor', 'tradelineCreditor.id', 'tradeline.creditorId')
        .leftJoin('bureau', 'bureau.id', 'tradeline.bureauId')
        // Only return records with valid tradelineId (exclude orphaned records)
        .where('creditorObligationTest.tradelineId', 'is not', null);

    const applyFilters = <T extends ReturnType<typeof buildBaseQuery>>(q: T): T => {
      let filtered = q;
      if (input.creditorId !== undefined) {
        filtered = filtered.where('creditorObligationTest.creditorId', '=', input.creditorId) as T;
      }
      if (input.obligationState !== undefined) {
        filtered = filtered.where('creditorObligationTest.obligationState', '=', input.obligationState as any) as T;
      }
      if (input.tradelineId !== undefined) {
        filtered = filtered.where('creditorObligationTest.tradelineId', '=', input.tradelineId) as T;
      }
      if (user.role !== 'admin') {
        filtered = filtered.where('tradeline.userId', '=', user.id) as T;
      }
      return filtered;
    };

    const shouldSuppressStaleForRow = (row: {
      violationCategory: string | null;
      tradelineStatus: string | null;
      tradelineDateClosed: Date | string | null;
      tradelineDatePaidSettled: Date | string | null;
      tradelineIsCollectionAccount: boolean | null;
      tradelineCollectionAgencyName: string | null;
      tradelineAccountType: string | null;
    }): boolean =>
      shouldSuppressStaleReportingViolation(row.violationCategory, {
        status: row.tradelineStatus,
        dateClosed: row.tradelineDateClosed,
        datePaidSettled: row.tradelineDatePaidSettled,
        isCollectionAccount: row.tradelineIsCollectionAccount,
        collectionAgencyName: row.tradelineCollectionAgencyName,
        accountType: row.tradelineAccountType,
      });

    try {
      const staleSuppressionSelectFields = [
      "tradeline.status as tradelineStatus",
      "tradeline.dateClosed as tradelineDateClosed",
      "tradeline.datePaidSettled as tradelineDatePaidSettled",
      "tradeline.isCollectionAccount as tradelineIsCollectionAccount",
      "tradeline.collectionAgencyName as tradelineCollectionAgencyName",
      "tradeline.accountType as tradelineAccountType",
      ] as const;

      const baseDataSelectFields = [
        'creditorObligationTest.id',
        'creditorObligationTest.creditorId',
        'creditorObligationTest.obligationType',
        'creditorObligationTest.obligationState',
        'creditorObligationTest.obligationSequence',
        'creditorObligationTest.disputeVector',
        'creditorObligationTest.lastChallengeDate',
        'creditorObligationTest.responseDeadline',
        'creditorObligationTest.responsesReceived',
        'creditorObligationTest.metro2Version',
        'creditorObligationTest.statutoryBasis',
        'creditorObligationTest.severity',
        'creditorObligationTest.omissions',
        'creditorObligationTest.validationStatus',
        'creditorObligationTest.escalationPath',
        'creditorObligationTest.notes',
        'creditorObligationTest.lastTestDate',
        'creditorObligationTest.tradelineId',
        'creditorObligationTest.createdAt',
        'creditorObligationTest.updatedAt',
        'creditorObligationTest.violationCategory',
        'creditorObligationTest.confidenceScore',
        'creditorObligationTest.autoGenerated',
        'creditorObligationTest.userExplanation',
        'creditorObligationTest.technicalDetails',
        'creditorObligationTest.recommendedAction',
        'creditorObligationTest.detectedAt',
        'creditorObligationTest.userStatus',
        'creditorObligationTest.userStatusReason',
        'creditorObligationTest.userStatusUpdatedAt',
        sql<string | null>`coalesce("creditor"."name", "tradelineCreditor"."name")`.as('creditorName'),
        'tradeline.accountNumber as tradelineAccountNumber',
        'tradeline.status as tradelineDisplayStatus',
        'tradeline.currentBalance as tradelineCurrentBalance',
        'tradeline.balance as tradelineBalance',
        'bureau.name as tradelineBureauName',
      ] as const;

      let staleSuppressionEnabled = true;

      // Count query (count only rows that remain after stale suppression when schema supports it)
      let total = 0;
      try {
        const countRows = await applyFilters(
          buildBaseQuery().select([
            "creditorObligationTest.violationCategory",
            ...staleSuppressionSelectFields,
          ])
        ).execute();
        total = countRows.filter((row) => !shouldSuppressStaleForRow(row)).length;
      } catch (error) {
        if (!isOptionalSchemaError(error)) {
          throw error;
        }
        staleSuppressionEnabled = false;
        console.warn("[creditor-validation/list] stale suppression count fallback due to schema mismatch", error);
        const fallbackCount = await applyFilters(
          buildBaseQuery().select((eb) => eb.fn.countAll<string>().as("total"))
        ).executeTakeFirst();
        total = parseInt(String(fallbackCount?.total ?? "0"), 10);
      }

      const buildDataQuery = (includeStaleSuppressionFields: boolean) => {
        let query = applyFilters(
          buildBaseQuery().select([
            ...baseDataSelectFields,
            ...(includeStaleSuppressionFields ? staleSuppressionSelectFields : []),
          ] as any)
        )
          .orderBy('creditorObligationTest.detectedAt', 'desc')
          .orderBy('creditorObligationTest.createdAt', 'desc');

        if (input.limit !== undefined) {
          query = query.limit(input.limit);
          if (input.offset !== undefined) {
            query = query.offset(input.offset);
          }
        }

        return query;
      };

      let dataRows: any[] = [];
      try {
        dataRows = await buildDataQuery(staleSuppressionEnabled).execute();
      } catch (error) {
        if (!isOptionalSchemaError(error)) {
          throw error;
        }
        staleSuppressionEnabled = false;
        console.warn("[creditor-validation/list] stale suppression data fallback due to schema mismatch", error);
        dataRows = await buildDataQuery(false).execute();
      }

      const obligationTests = staleSuppressionEnabled
        ? dataRows.filter((row) => !shouldSuppressStaleForRow(row))
        : dataRows;

      // Province enrichment: for any test missing province in technicalDetails,
      // look it up from report_consumer_info via the tradeline's report_artifact_id.
      const tradelineIdsNeedingProvince = [
        ...new Set(
          obligationTests
            .filter((t) => {
              const td = t.technicalDetails as Record<string, unknown> | null;
              return t.tradelineId !== null && (!td || !td['province']);
            })
            .map((t) => t.tradelineId as number)
        ),
      ];

      const tradelineProvinceMap = new Map<number, string>();

      if (tradelineIdsNeedingProvince.length > 0) {
        try {
          const provinceRows = await db
            .selectFrom('tradeline')
            .innerJoin(
              'reportConsumerInfo',
              'reportConsumerInfo.reportArtifactId',
              'tradeline.reportArtifactId'
            )
            .select(['tradeline.id as tradelineId', 'reportConsumerInfo.province'])
            .where('tradeline.id', 'in', tradelineIdsNeedingProvince)
            .where('reportConsumerInfo.province', 'is not', null)
            .where('tradeline.reportArtifactId', 'is not', null)
            .execute();

          for (const row of provinceRows) {
            if (row.province && !tradelineProvinceMap.has(row.tradelineId)) {
              tradelineProvinceMap.set(row.tradelineId, row.province);
            }
          }

          console.log(`Province enrichment: resolved province for ${tradelineProvinceMap.size} of ${tradelineIdsNeedingProvince.length} tradelines needing enrichment`);
        } catch (error) {
          if (!isOptionalSchemaError(error)) {
            throw error;
          }
          console.warn("[creditor-validation/list] province enrichment skipped due to schema mismatch", error);
        }
      }

      // Apply enriched provinces to technicalDetails only when a real province was found.
      const enrichedObligationTests = obligationTests.map((test) => {
        const td = test.technicalDetails as Record<string, unknown> | null;
        if (test.tradelineId !== null && (!td || !td['province'])) {
          const province = tradelineProvinceMap.get(test.tradelineId as number);
          if (province) {
            return {
              ...test,
              technicalDetails: { ...(td ?? {}), province },
            };
          }
        }
        return test;
      });

      const responseObligationTests = staleSuppressionEnabled
        ? enrichedObligationTests.map((test) => {
            const {
              tradelineStatus,
              tradelineDateClosed,
              tradelineDatePaidSettled,
              tradelineIsCollectionAccount,
              tradelineCollectionAgencyName,
              tradelineAccountType,
              ...rest
            } = test as any;
            return rest;
          })
        : enrichedObligationTests;

      return new Response(JSON.stringify(toJsonSafe({ obligationTests: responseObligationTests as any, total } satisfies OutputType)));
    } catch (mainFlowError) {
      const fallback = await buildMinimalFallback(mainFlowError);
      return new Response(JSON.stringify(toJsonSafe(fallback)));
    }
  } catch (error) {
    console.error("Error listing creditor obligation tests:", error);
    return handleEndpointError(error);
  }
}
