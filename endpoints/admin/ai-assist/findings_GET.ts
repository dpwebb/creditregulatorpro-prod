import { sql } from "kysely";

import { db } from "../../../helpers/db";
import { handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { requireAdminUser } from "../../../helpers/requireAdminUser";
import { getViolationDisplayLabel } from "../../../helpers/getViolationLabel";
import { schema, OutputType } from "./findings_GET.schema";

type FindingLookupRow = Omit<OutputType["findings"][number], "accountNumberMasked" | "displayLabel" | "detectedAt"> & {
  accountNumber: string | null;
  detectedAt: unknown;
};

function maskAccountNumber(accountNumber: string | null): string | null {
  if (!accountNumber) return null;
  const trimmed = accountNumber.trim();
  if (!trimmed) return null;
  if (trimmed.includes("*")) return trimmed;

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 4) return `ending in ${digits.slice(-4)}`;
  return "masked";
}

function toIsoString(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export async function handle(request: Request) {
  try {
    await requireAdminUser(request);

    const url = new URL(request.url);
    const input = schema.parse(Object.fromEntries(url.searchParams.entries()));
    const normalizedQuery = input.q?.trim() ?? "";
    const searchPattern = `%${normalizedQuery}%`;
    const numericId = /^\d+$/.test(normalizedQuery) ? Number(normalizedQuery) : null;
    const numericIdClause = numericId === null ? sql`false` : sql`cot.id = ${numericId}`;
    const ownerIdExpression = sql<number | null>`coalesce(t.user_id, ra.user_id, packet_owner.user_id)`;
    const fromClause = sql`
        from public.creditor_obligation_test cot
        left join public.tradeline t on t.id = cot.tradeline_id
        left join public.report_artifact ra on ra.id = t.report_artifact_id
        left join lateral (
          select p.user_id
          from public.packet p
          where p.creditor_obligation_test_id = cot.id
            and p.user_id is not null
          order by p.id desc
          limit 1
        ) packet_owner on true
        left join public.users u on u.id = ${ownerIdExpression}
        left join public.user_account ua on ua.user_id = ${ownerIdExpression}
        left join public.creditor c on c.id = cot.creditor_id
        left join public.creditor tc on tc.id = t.creditor_id
        left join public.bureau b on b.id = t.bureau_id
      `;
    const searchClause = normalizedQuery
      ? sql`
        where (
          ${numericIdClause}
          or u.email ilike ${searchPattern}
          or u.display_name ilike ${searchPattern}
          or ua.email ilike ${searchPattern}
          or ua.full_name ilike ${searchPattern}
          or c.name ilike ${searchPattern}
          or tc.name ilike ${searchPattern}
          or t.collection_agency_name ilike ${searchPattern}
          or t.original_creditor_name ilike ${searchPattern}
          or t.account_number ilike ${searchPattern}
          or t.account_type ilike ${searchPattern}
          or b.name ilike ${searchPattern}
          or cot.violation_category::text ilike ${searchPattern}
          or cot.user_status::text ilike ${searchPattern}
        )
      `
      : sql``;

    const [findingsResult, countResult] = await Promise.all([
      sql<FindingLookupRow>`
        select
          cot.id::integer as "id",
          cot.tradeline_id::integer as "tradelineId",
          ${ownerIdExpression}::integer as "userId",
          coalesce(u.email, ua.email) as "userEmail",
          coalesce(u.display_name, ua.full_name) as "userDisplayName",
          coalesce(c.name, tc.name, t.collection_agency_name, t.original_creditor_name) as "creditorName",
          b.name as "bureauName",
          t.account_type as "accountType",
          t.account_number as "accountNumber",
          cot.violation_category::text as "violationCategory",
          cot.user_status::text as "userStatus",
          cot.detected_at as "detectedAt"
        ${fromClause}
        ${searchClause}
        order by cot.detected_at desc nulls last, cot.created_at desc nulls last, cot.id desc
        limit ${input.limit}
        offset ${input.offset}
      `.execute(db),
      sql<{ total: number }>`
        select count(*)::integer as total
        ${fromClause}
        ${searchClause}
      `.execute(db),
    ]);

    const findings = findingsResult.rows.map((row) => ({
      id: row.id,
      tradelineId: row.tradelineId,
      userId: row.userId,
      userEmail: row.userEmail,
      userDisplayName: row.userDisplayName,
      creditorName: row.creditorName,
      bureauName: row.bureauName,
      accountType: row.accountType,
      accountNumberMasked: maskAccountNumber(row.accountNumber),
      violationCategory: row.violationCategory,
      displayLabel: getViolationDisplayLabel({
        violationCategory: row.violationCategory as any,
        technicalDetails: null,
      }),
      userStatus: row.userStatus,
      detectedAt: toIsoString(row.detectedAt),
    }));

    return new Response(
      JSON.stringify({
        findings,
        total: countResult.rows[0]?.total ?? 0,
      } satisfies OutputType),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}
