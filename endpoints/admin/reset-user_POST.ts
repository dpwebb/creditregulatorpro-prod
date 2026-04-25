import { schema, OutputType } from "./reset-user_POST.schema";
import { db } from "../../helpers/db";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { deleteReportArtifactCascade } from "../../helpers/deleteReportArtifactCascade";
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

    // 3. Query all report_artifact records for the given userId
    const artifacts = await db
      .selectFrom("reportArtifact")
      .select("id")
      .where("userId", "=", input.userId)
      .execute();

    // 4. Delete each report artifact using the cascade helper
    let deletedReportArtifacts = 0;
    for (const artifact of artifacts) {
      await deleteReportArtifactCascade(artifact.id, adminUser.id, request);
      deletedReportArtifacts++;
    }

    // 5. Delete fraud freeze records (identityTheftFreeze)
    const deleteFreezesResult = await db
      .deleteFrom("identityTheftFreeze")
      .where("userId", "=", input.userId)
      .executeTakeFirst();

    const deletedFreezeRecords = Number(deleteFreezesResult.numDeletedRows || 0);

    // 6. change_detection_snapshot does not exist in the current DB schema, skipped.

    // 7. Log the reset action
    await logAudit({
      action: "DELETE",
      entityType: "USER_ACCOUNT",
      entityId: input.userId,
      userId: adminUser.id,
      details: {
        action: "ACCOUNT_DATA_RESET",
        deletedReportArtifacts,
        deletedFreezeRecords,
        targetEmail: targetUser.email,
      },
      status: "SUCCESS",
      request,
    });

    // 8. Return response
    const output: OutputType = {
      success: true,
      deletedReportArtifacts,
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