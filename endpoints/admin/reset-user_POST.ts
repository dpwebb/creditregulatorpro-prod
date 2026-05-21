import { schema, OutputType } from "./reset-user_POST.schema";
import { db } from "../../helpers/db";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { deleteUserReportDataCascade } from "../../helpers/deleteReportArtifactCascade";
import { logAudit } from "../../helpers/auditLogger";

function logResetFailure(error: unknown): void {
  if (error instanceof BusinessRuleError) {
    console.warn("[admin-reset-user] Request rejected.", {
      statusCode: error.statusCode,
      reason: error.message,
    });
    return;
  }

  if (typeof error === "object" && error !== null) {
    const candidate = error as { code?: unknown; constraint?: unknown; table?: unknown; message?: unknown };
    console.error("[admin-reset-user] Unexpected reset failure.", {
      code: typeof candidate.code === "string" ? candidate.code : undefined,
      constraint: typeof candidate.constraint === "string" ? candidate.constraint : undefined,
      table: typeof candidate.table === "string" ? candidate.table : undefined,
      message: typeof candidate.message === "string" ? candidate.message : "Unexpected error",
    });
    return;
  }

  console.error("[admin-reset-user] Unexpected reset failure.", { message: "Unexpected error" });
}

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
      .select(["id", "email", "role"])
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

    const normalizedTargetEmail = targetUser.email.trim().toLowerCase();
    const normalizedConfirmEmail = input.confirmEmail.trim().toLowerCase();
    if (normalizedTargetEmail !== normalizedConfirmEmail) {
      throw new BusinessRuleError("Confirmation email does not match the target user's email", 400);
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
      action: "UPDATE",
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
    logResetFailure(error);
    return handleEndpointError(error);
  }
}
