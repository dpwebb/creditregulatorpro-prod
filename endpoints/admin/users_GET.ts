import { schema, OutputType } from "./users_GET.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { UserRole } from "../../helpers/schema";
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

    const limit = input.limit ?? 25;
    const offset = input.offset ?? 0;
    const normalizedSearch = input.search?.trim();

    // 3. Build Query
    let query = db
      .selectFrom("users")
      .select([
        "users.id",
        "users.email",
        "users.displayName",
        "users.role",
        "users.createdAt",
        "users.emailVerified",
        "users.avatarUrl",
        (eb) =>
          eb
            .selectFrom("subscriptions")
            .select("subscriptions.plan")
            .whereRef("subscriptions.userId", "=", "users.id")
            .orderBy("subscriptions.updatedAt", "desc")
            .limit(1)
            .as("subscriptionPlan"),
        (eb) =>
          eb
            .selectFrom("subscriptions")
            .select("subscriptions.status")
            .whereRef("subscriptions.userId", "=", "users.id")
            .orderBy("subscriptions.updatedAt", "desc")
            .limit(1)
            .as("subscriptionStatus"),
        (eb) =>
          eb
            .selectFrom("userAccount")
            .select("userAccount.fullName")
            .whereRef("userAccount.userId", "=", "users.id")
            .orderBy("userAccount.createdAt", "desc")
            .limit(1)
            .as("fullName"),
        (eb) =>
          eb
            .selectFrom("tradeline")
            .select(sql<number>`count(*)`.as("count"))
            .whereRef("tradeline.userId", "=", "users.id")
            .as("tradelinesCount"),
        (eb) =>
          eb
            .selectFrom("packet")
            .select(sql<number>`count(*)`.as("count"))
            .whereRef("packet.userId", "=", "users.id")
            .as("packetsCount"),
        (eb) =>
          eb
            .selectFrom("auditLog")
            .select(sql<number>`count(*)`.as("count"))
            .whereRef("auditLog.userId", "=", "users.id")
            .where("auditLog.entityType", "=", "EVIDENCE_EVENT")
            .where("auditLog.actionType", "=", "CREATE")
            .as("evidenceEventsCount"),
        (eb) =>
          eb
            .selectFrom("reportArtifact")
            .select(sql<number>`count(*)`.as("count"))
            .whereRef("reportArtifact.userId", "=", "users.id")
            .as("reportArtifactsCount"),
      ]);

    let countQuery = db
      .selectFrom("users")
      .select(sql<number>`count(*)`.as("count"));

    // 4. Apply Filters
    if (input.role) {
      query = query.where("users.role", "=", input.role as UserRole);
      countQuery = countQuery.where("users.role", "=", input.role as UserRole);
    }

    if (normalizedSearch) {
      const searchLower = `%${normalizedSearch.toLowerCase()}%`;
      query = query.where((eb) =>
        eb.or([
          eb(sql`lower(users.email)`, "like", searchLower),
          eb(sql`lower(users.display_name)`, "like", searchLower),
        ])
      );
      countQuery = countQuery.where((eb) =>
        eb.or([
          eb(sql`lower(users.email)`, "like", searchLower),
          eb(sql`lower(users.display_name)`, "like", searchLower),
        ])
      );
    }

    // 5. Execute Query
    const [users, countResult] = await Promise.all([
      query
        .orderBy("users.createdAt", "desc")
        .limit(limit)
        .offset(offset)
        .execute(),
      countQuery.executeTakeFirst(),
    ]);

    // 6. Transform Result (handle string counts from SQL)
    const transformedUsers = users.map((u) => ({
      ...u,
      fullName: u.fullName ?? null,
      tradelinesCount: Number(u.tradelinesCount || 0),
      packetsCount: Number(u.packetsCount || 0),
      evidenceEventsCount: Number(u.evidenceEventsCount || 0),
      reportArtifactsCount: Number(u.reportArtifactsCount || 0),
      subscriptionPlan: u.subscriptionPlan ?? null,
      subscriptionStatus: u.subscriptionStatus ?? null,
    }));

    // 7. Return Response
    return new Response(JSON.stringify({
      users: transformedUsers,
      total: Number(countResult?.count ?? 0),
    } satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
