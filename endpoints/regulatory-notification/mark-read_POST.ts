import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { schema, OutputType } from "./mark-read_POST.schema";
export async function handle(request: Request) {
  try {
    await getServerUserSession(request);

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    const ids = input.ids || (input.id ? [input.id] : []);

    if (ids.length > 0) {
      await db
        .updateTable("regulatoryNotification")
        .set({ isRead: true, readAt: new Date() })
        .where("id", "in", ids)
        .execute();
    }

    return new Response(
      JSON.stringify({ success: true } satisfies OutputType)
    );
  } catch (error) {
    console.error("Mark read error:", error);
    return handleEndpointError(error);
  }
}