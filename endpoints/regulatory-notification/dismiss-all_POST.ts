import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { schema, OutputType } from "./dismiss-all_POST.schema";


export async function handle(request: Request) {
  try {
    await getServerUserSession(request);

    await db
      .updateTable("regulatoryNotification")
      .set({ isRead: true, readAt: new Date() })
      .where("isRead", "=", false)
      .execute();

    return new Response(
      JSON.stringify({ success: true } satisfies OutputType)
    );
  } catch (error) {
    console.error("Dismiss all error:", error);
    return handleEndpointError(error);
  }
}