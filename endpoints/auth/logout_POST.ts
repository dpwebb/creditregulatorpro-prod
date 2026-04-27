// adapt this to your database schema
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import {
  getServerSessionOrThrow,
  clearServerSession,
  NotAuthenticatedError,
} from "../../helpers/getSetServerSession";
import { logLogout } from "../../helpers/auditLogger";

export async function handle(request: Request) {
  try {
    // Get the current session
    const session = await getServerSessionOrThrow(request);

    // Get user ID before deleting session
    const sessionData = await db
      .selectFrom("sessions")
      .select("userId")
      .where("id", "=", session.id)
      .executeTakeFirst();

    const userId = sessionData?.userId;

    // Delete the session from the database
    await db.deleteFrom("sessions").where("id", "=", session.id).execute();

    // Log logout
    if (userId) {
      await logLogout(userId, request);
    }

    // Create response with success message
    const response = Response.json({
      success: true,
      message: "Logged out successfully",
    });

    clearServerSession(response);

    return response;
  } catch (error) {
    if (error instanceof NotAuthenticatedError) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("Logout error:", error);
    return handleEndpointError(error);
  }
}
