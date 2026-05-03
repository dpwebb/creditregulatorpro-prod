import { schema, OutputType } from "./audit-logs_GET.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { db } from "../../helpers/db";
import { BusinessRuleError, handleEndpointError } from "../../helpers/endpointErrorHandler";
import { sql } from "kysely";
import { sanitizeAuditLogDetails } from "../../helpers/auditLogSanitizer";

function parseDateFilter(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BusinessRuleError("Invalid date filter", 400);
  }
  return parsed;
}

function getEndOfDayExclusive(dateValue: string | undefined): Date | undefined {
  if (!dateValue) return undefined;
  const trimmed = dateValue.trim();
  const parsed = parseDateFilter(trimmed);
  if (!parsed) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const endExclusive = new Date(parsed);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    return endExclusive;
  }
  return parsed;
}

export async function handle(request: Request) {
  try {
    // 1. Authorization Check
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      console.warn(`Unauthorized admin endpoint access attempt by user ${user.id} (role: ${user.role}) on ${request.url}`);
      return new Response(
        JSON.stringify({ error: "Admin privileges required" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Parse Input
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const input = schema.parse(queryParams);

    // 3. Build base filtered queries
    let query = db
      .selectFrom("auditLog")
      .leftJoin("users", "auditLog.userId", "users.id")
      .select([
        "auditLog.id",
        "auditLog.actionType",
        "auditLog.entityType",
        "auditLog.entityId",
        "auditLog.userId",
        "auditLog.details",
        "auditLog.status",
        "auditLog.errorMessage",
        "auditLog.ipAddress",
        "auditLog.userAgent",
        "auditLog.region",
        "auditLog.timestamp",
        "users.email as userEmail",
        "users.displayName as userDisplayName",
      ]);

    let countQuery = db
      .selectFrom("auditLog")
      .select(db.fn.count("auditLog.id").as("count"));

    // 4. Apply Filters to both queries
    if (input.actionType) {
      query = query.where("auditLog.actionType", "=", input.actionType);
      countQuery = countQuery.where("auditLog.actionType", "=", input.actionType);
    }

    if (input.entityType) {
      query = query.where("auditLog.entityType", "=", input.entityType);
      countQuery = countQuery.where("auditLog.entityType", "=", input.entityType);
    }

    if (input.status) {
      query = query.where("auditLog.status", "=", input.status);
      countQuery = countQuery.where("auditLog.status", "=", input.status);
    }

    if (input.userId) {
      query = query.where("auditLog.userId", "=", input.userId);
      countQuery = countQuery.where("auditLog.userId", "=", input.userId);
    }

    if (input.email) {
      const emailPattern = `%${input.email.toLowerCase()}%`;
      query = query.where(sql<boolean>`users.email ILIKE ${emailPattern}`);
      countQuery = countQuery
        .leftJoin("users", "auditLog.userId", "users.id")
        .where(sql<boolean>`users.email ILIKE ${emailPattern}`);
    }

    const parsedStartDate = parseDateFilter(input.startDate);
    const parsedEndDateExclusive = getEndOfDayExclusive(input.endDate);

    if (parsedStartDate) {
      query = query.where("auditLog.timestamp", ">=", parsedStartDate);
      countQuery = countQuery.where("auditLog.timestamp", ">=", parsedStartDate);
    }

    if (parsedEndDateExclusive) {
      query = query.where("auditLog.timestamp", "<", parsedEndDateExclusive);
      countQuery = countQuery.where("auditLog.timestamp", "<", parsedEndDateExclusive);
    }

    // 5. Pagination and Sorting (only for main query)
    const limit = input.limit ?? 100;
    const offset = input.offset ?? 0;

    const paginatedQuery = query
      .orderBy("auditLog.timestamp", "desc")
      .limit(limit)
      .offset(offset);

    // 6. Execute both queries in parallel
    const [logs, countResult] = await Promise.all([
      paginatedQuery.execute(),
      countQuery.executeTakeFirst(),
    ]);

    const total = Number(countResult?.count ?? 0);
    const sanitizedLogs = logs.map((log) => ({
      ...log,
      details: sanitizeAuditLogDetails(log.details),
    }));

    // 7. Return Response
    return new Response(JSON.stringify({ logs: sanitizedLogs, total } satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
