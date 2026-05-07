import { schema, OutputType } from "./reset-user_POST.schema";
import { db } from "../../helpers/db";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { deleteUserReportDataCascade } from "../../helpers/deleteReportArtifactCascade";
import { logAudit } from "../../helpers/auditLogger";

export async function handle(request: Request) {
  try {
    // 1. Validate admin session
    const { user: adminUser } = await getServerUserSession(request);

    if (adminUser.role !== "admin") {
      throw new BusinessRuleError("Unauthorized: Admin access required", 403);
    }

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    // 2. Verify target user exists and is NOT an admin
    const targetUser = await db
      .selectFrom("users")
      .select(["email", "role"])
      .where("id", "=", input.userId)
      .executeTakeFirst();

    if (!targetUser) {
      throw new BusinessRuleError(`User with ID ${input.userId} not found`, 404);
    }

    if (targetUser.role === "admin") {
      throw new BusinessRuleError("Cannot reset an admin account", 400);
    }

    if (input.userId === adminUser.id) {
      throw new BusinessRuleError("Cannot reset the current admin account", 400);
    }

    // 3. Delete report artifacts, tradelines, and all downstream report-derived data.
    const resetCounts = await deleteUserReportDataCascade(input.userId, adminUser.id, request);

    // 4. Delete fraud freeze records (identityTheftFreeze)
    const deleteFreezesResult = await db
      .deleteFrom("identityTheftFreeze")
      .where("userId", "=", input.userId)
      .executeTakeFirst();

    const deletedFreezeRecords = Number(deleteFreezesResult.numDeletedRows || 0);

    // 5. change_detection_snapshot does not exist in the current DB schema, skipped.

    // 6. Log the reset action
    await logAudit({
      action: "DELETE",
      entityType: "USER_ACCOUNT",
      entityId: input.userId,
      userId: adminUser.id,
      details: {
        action: "ACCOUNT_DATA_RESET",
        ...resetCounts,
        deletedFreezeRecords,
        targetEmail: targetUser.email,
      },
      status: "SUCCESS",
      request,
    });

    // 7. Return response
    const output: OutputType = {
      success: true,
      ...resetCounts,
      deletedFreezeRecords,
      userEmail: targetUser.email,
    };

    return new Response(JSON.stringify(output satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
