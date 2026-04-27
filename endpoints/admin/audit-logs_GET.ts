import { schema, OutputType } from "./audit-logs_GET.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { AuditActionType, AuditEntityType, AuditStatus } from "../../helpers/schema";
import { sql } from "kysely";

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
      .leftJoin("users", "auditLog.userId", "users.id")
      .select(db.fn.count("auditLog.id").as("count"));

    // 4. Apply Filters to both queries
    if (input.actionType) {
      query = query.where("auditLog.actionType", "=", input.actionType as AuditActionType);
      countQuery = countQuery.where("auditLog.actionType", "=", input.actionType as AuditActionType);
    }

    if (input.entityType) {
      query = query.where("auditLog.entityType", "=", input.entityType as AuditEntityType);
      countQuery = countQuery.where("auditLog.entityType", "=", input.entityType as AuditEntityType);
    }

    if (input.status) {
      query = query.where("auditLog.status", "=", input.status as AuditStatus);
      countQuery = countQuery.where("auditLog.status", "=", input.status as AuditStatus);
    }

    if (input.userId) {
      query = query.where("auditLog.userId", "=", input.userId);
      countQuery = countQuery.where("auditLog.userId", "=", input.userId);
    }

    if (input.email) {
      const emailPattern = `%${input.email}%`;
      query = query.where(sql<boolean>`users.email ILIKE ${emailPattern}`);
      countQuery = countQuery.where(sql<boolean>`users.email ILIKE ${emailPattern}`);
    }

    if (input.startDate) {
      query = query.where("auditLog.timestamp", ">=", new Date(input.startDate));
      countQuery = countQuery.where("auditLog.timestamp", ">=", new Date(input.startDate));
    }

    if (input.endDate) {
      query = query.where("auditLog.timestamp", "<=", new Date(input.endDate));
      countQuery = countQuery.where("auditLog.timestamp", "<=", new Date(input.endDate));
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

    // 7. Return Response
    return new Response(JSON.stringify({ logs, total } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}