import { schema, OutputType } from "./list_GET.schema";

import { db } from "../../helpers/db";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { sanitizeTicketPreview } from "../../helpers/ticketTextSanitizer";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const query = schema.parse(params);
    const staleBefore = query.staleHours
      ? new Date(Date.now() - query.staleHours * 60 * 60 * 1000)
      : undefined;

    const applyCommonFilters = (baseQuery: any) => {
      let next = baseQuery;

      if (query.status) {
        next = next.where("supportTicket.status", "=", query.status);
      }
      if (query.category) {
        next = next.where("supportTicket.category", "=", query.category);
      }
      if (query.priority) {
        next = next.where("supportTicket.priority", "=", query.priority);
      }
      if (query.search) {
        next = next.where((eb: any) =>
          eb.or([
            eb("supportTicket.subject", "ilike", `%${query.search}%`),
            eb("supportTicket.description", "ilike", `%${query.search}%`),
          ])
        );
      }

      if (user.role === "user") {
        next = next.where("supportTicket.userId", "=", user.id);
      } else if (user.role === "support") {
        next = next.where((eb: any) =>
          eb.or([
            eb("supportTicket.assignedAgentId", "=", user.id),
            eb.and([
              eb("supportTicket.assignedAgentId", "is", null),
              eb("supportTicket.status", "=", "OPEN"),
            ]),
          ])
        );
      }

      if (query.assignment && user.role !== "user") {
        if (query.assignment === "ASSIGNED") {
          next = next.where("supportTicket.assignedAgentId", "is not", null);
        } else if (query.assignment === "UNASSIGNED") {
          next = next.where("supportTicket.assignedAgentId", "is", null);
        } else if (query.assignment === "MINE") {
          next = next.where("supportTicket.assignedAgentId", "=", user.id);
        }
      }

      if (staleBefore) {
        next = next.where("supportTicket.updatedAt", "<=", staleBefore);
      }

      return next;
    };

    // Count query
    const countQuery = applyCommonFilters(db.selectFrom("supportTicket"))
      .select((eb: any) => eb.fn.countAll().as("total"));

    const countResult = countQuery.executeTakeFirstOrThrow();

    // Data query
    const dataResult = applyCommonFilters(db.selectFrom("supportTicket"))
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
      latestMessagePreview: sanitizeTicketPreview(r.latestMessagePreview),
    }));

    return new Response(
      JSON.stringify({ tickets: formattedResults, total } satisfies OutputType),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}
