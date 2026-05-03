import { schema, OutputType } from "./log_GET.schema";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { sanitizeAuditLogDetails } from "../../helpers/auditLogSanitizer";

export async function handle(request: Request) {
  try {
    // 1. Authentication & Authorization
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Admin access required" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Parse Query Parameters
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const input = schema.parse(queryParams);

    // 3. Build Query
    let query = db
      .selectFrom("auditLog")
      .leftJoin("users", "auditLog.userId", "users.id")
      .select([
        "auditLog.id",
        "auditLog.actionType",
        "auditLog.entityType",
        "auditLog.entityId",
        "auditLog.userId",
        "users.email as userEmail",
        "auditLog.details",
        "auditLog.status",
        "auditLog.errorMessage",
        "auditLog.ipAddress",
        "auditLog.userAgent",
        "auditLog.timestamp",
        "auditLog.region",
      ]);

    // Apply filters
    if (input.userId) {
      query = query.where("auditLog.userId", "=", input.userId);
    }
    if (input.actionType) {
      query = query.where("auditLog.actionType", "=", input.actionType);
    }
    if (input.entityType) {
      query = query.where("auditLog.entityType", "=", input.entityType);
    }
    if (input.status) {
      query = query.where("auditLog.status", "=", input.status);
    }
    if (input.startDate) {
      query = query.where("auditLog.timestamp", ">=", input.startDate);
    }
    const endDateExclusive = input.endDate
      ? new Date(
          Date.UTC(
            input.endDate.getUTCFullYear(),
            input.endDate.getUTCMonth(),
            input.endDate.getUTCDate() + 1
          )
        )
      : undefined;
    if (endDateExclusive) {
      query = query.where("auditLog.timestamp", "<", endDateExclusive);
    }

    // Get total count (separate query for performance/simplicity with Kysely)
    // We clone the base query logic for counting
    let countQuery = db
      .selectFrom("auditLog")
      .select(db.fn.count("id").as("count"));

    if (input.userId) {
      countQuery = countQuery.where("userId", "=", input.userId);
    }
    if (input.actionType) {
      countQuery = countQuery.where("actionType", "=", input.actionType);
    }
    if (input.entityType) {
      countQuery = countQuery.where("entityType", "=", input.entityType);
    }
    if (input.status) {
      countQuery = countQuery.where("status", "=", input.status);
    }
    if (input.startDate) {
      countQuery = countQuery.where("timestamp", ">=", input.startDate);
    }
    if (endDateExclusive) {
      countQuery = countQuery.where("timestamp", "<", endDateExclusive);
    }

    const [logs, countResult] = await Promise.all([
      query
        .orderBy("auditLog.timestamp", "desc")
        .limit(input.limit)
        .offset(input.offset)
        .execute(),
      countQuery.executeTakeFirst(),
    ]);

    const total = Number(countResult?.count ?? 0);
    const sanitizedLogs = logs.map((log) => ({
      ...log,
      details: sanitizeAuditLogDetails(log.details),
    }));

    // 4. Return Response
    return new Response(
      JSON.stringify({
        logs: sanitizedLogs,
        total,
      } satisfies OutputType),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}
