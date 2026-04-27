import { schema, OutputType } from "./list_GET.schema";

import { db } from "../../helpers/db";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const query = schema.parse(params);

    // Count query
    let countQuery = db.selectFrom("supportTicket");

    if (query.status) {
      countQuery = countQuery.where("supportTicket.status", "=", query.status);
    }
    if (query.category) {
      countQuery = countQuery.where("supportTicket.category", "=", query.category);
    }
    if (query.priority) {
      countQuery = countQuery.where("supportTicket.priority", "=", query.priority);
    }
    if (query.search) {
      countQuery = countQuery.where("supportTicket.subject", "ilike", `%${query.search}%`);
    }

    if (user.role === "user") {
      countQuery = countQuery.where("supportTicket.userId", "=", user.id);
    } else if (user.role === "support") {
      countQuery = countQuery.where((eb) =>
        eb.or([
          eb("supportTicket.assignedAgentId", "=", user.id),
          eb.and([
            eb("supportTicket.assignedAgentId", "is", null),
            eb("supportTicket.status", "=", "OPEN"),
          ]),
        ])
      );
    }

    const countResult = countQuery
      .select((eb) => eb.fn.countAll<number>().as("total"))
      .executeTakeFirstOrThrow();

    // Data query
    let dataQuery = db.selectFrom("supportTicket");

    if (query.status) {
      dataQuery = dataQuery.where("supportTicket.status", "=", query.status);
    }
    if (query.category) {
      dataQuery = dataQuery.where("supportTicket.category", "=", query.category);
    }
    if (query.priority) {
      dataQuery = dataQuery.where("supportTicket.priority", "=", query.priority);
    }
    if (query.search) {
      dataQuery = dataQuery.where("supportTicket.subject", "ilike", `%${query.search}%`);
    }

    if (user.role === "user") {
      dataQuery = dataQuery.where("supportTicket.userId", "=", user.id);
    } else if (user.role === "support") {
      dataQuery = dataQuery.where((eb) =>
        eb.or([
          eb("supportTicket.assignedAgentId", "=", user.id),
          eb.and([
            eb("supportTicket.assignedAgentId", "is", null),
            eb("supportTicket.status", "=", "OPEN"),
          ]),
        ])
      );
    }

    const dataResult = dataQuery
      .innerJoin("users as owner", "owner.id", "supportTicket.userId")
      .leftJoin("users as agent", "agent.id", "supportTicket.assignedAgentId")
      .select([
        "supportTicket.id",
        "supportTicket.subject",
        "supportTicket.category",
        "supportTicket.priority",
        "supportTicket.status",
        "supportTicket.createdAt",
        "supportTicket.updatedAt",
        "supportTicket.userId",
        "owner.displayName as userDisplayName",
        "agent.displayName as assignedAgentName",
      ])
      .select((eb) =>
        eb
          .selectFrom("supportTicketMessage")
          .select("message")
          .whereRef("ticketId", "=", "supportTicket.id")
          .$if(user.role === "user", (qb) => qb.where("isInternalNote", "=", false))
          .orderBy("createdAt", "desc")
          .limit(1)
          .as("latestMessagePreview")
      )
      .orderBy("supportTicket.updatedAt", "desc")
      .limit(query.limit)
      .offset(query.offset)
      .execute();

    const [countRow, results] = await Promise.all([countResult, dataResult]);

    const total = Number(countRow.total);

    const formattedResults = results.map((r) => ({
      ...r,
      createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt : new Date(r.updatedAt),
    }));

    return new Response(
      JSON.stringify({ tickets: formattedResults, total } satisfies OutputType),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}