import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";
import { schema, OutputType } from "./list_GET.schema";
export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), { status: 403 });
    }

    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const input = schema.parse({
      unreadOnly: params.unreadOnly === "true",
      limit: params.limit ? parseInt(params.limit, 10) : undefined,
    });

    const limit = input.limit ?? 50;

    let query = db
      .selectFrom("regulatoryNotification")
      .leftJoin("regulatoryUpdateLog", "regulatoryUpdateLog.id", "regulatoryNotification.regulatoryUpdateId")
      .selectAll("regulatoryNotification")
      .select("regulatoryUpdateLog.title as regulatoryUpdateTitle")
      .orderBy("regulatoryNotification.createdAt", "desc")
      .limit(limit);

    if (input.unreadOnly) {
      query = query.where("regulatoryNotification.isRead", "=", false);
    }

    const notifications = await query.execute();

    const unreadCountRow = await db
      .selectFrom("regulatoryNotification")
      .select((eb) => eb.fn.count<number>("id").as("count"))
      .where("isRead", "=", false)
      .executeTakeFirst();

    const unreadCount = Number(unreadCountRow?.count || 0);

    return new Response(
      JSON.stringify({
        notifications,
        unreadCount,
      } satisfies OutputType)
    );
  } catch (error) {
    console.error("List notifications error:", error);
    return handleEndpointError(error);
  }
}