import { schema, OutputType } from "./delete-user_POST.schema";
import { db } from "../../helpers/db";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { deleteReportArtifactCascade, deleteTradeline } from "../../helpers/deleteReportArtifactCascade";
import { logAudit } from "../../helpers/auditLogger";
import postgres from "postgres";

function isOptionalSchemaError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (((error as { code?: unknown }).code === "42P01") || // undefined_table
      ((error as { code?: unknown }).code === "42703")) // undefined_column
  );
}

async function runOptionalDeleteStep(stepName: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (!isOptionalSchemaError(error)) {
      throw error;
    }
    console.warn(`[delete-user] Optional step skipped (${stepName}) due to schema mismatch:`, error);
  }
}

type UserFkReference = {
  table_name: string;
  column_name: string;
  is_nullable: "YES" | "NO";
  delete_rule: string;
};

function quoteIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23503"
  );
}

async function runDynamicUserFkCleanup(
  targetUserId: number,
  adminUserId: number,
  purgedCounts: Record<string, number>
): Promise<void> {
  if (!process.env.FLOOT_DATABASE_URL) {
    console.warn("[delete-user] FLOOT_DATABASE_URL unavailable; skipping dynamic FK cleanup.");
    return;
  }

  const sqlClient = postgres(process.env.FLOOT_DATABASE_URL, {
    prepare: false,
    max: 1,
    idle_timeout: 10,
  });

  try {
    const fkRows = await sqlClient.unsafe<UserFkReference[]>(
      `
      SELECT
        tc.table_name,
        kcu.column_name,
        cols.is_nullable,
        rc.delete_rule
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints AS rc
        ON rc.constraint_name = tc.constraint_name
        AND rc.constraint_schema = tc.table_schema
      JOIN information_schema.columns AS cols
        ON cols.table_schema = tc.table_schema
        AND cols.table_name = tc.table_name
        AND cols.column_name = kcu.column_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND ccu.table_name = 'users'
      ORDER BY tc.table_name, kcu.column_name
      `
    );

    for (const ref of fkRows) {
      if (
        ref.table_name === "users" ||
        ref.delete_rule === "CASCADE" ||
        ref.delete_rule === "SET NULL"
      ) {
        continue;
      }

      const table = quoteIdentifier(ref.table_name);
      const column = quoteIdentifier(ref.column_name);
      const metricKey = `dynamicFk_${ref.table_name}_${ref.column_name}`;

      if (ref.table_name === "parser_test_case" && ref.column_name === "created_by") {
        const updatedRows = await sqlClient.unsafe(
          `UPDATE ${table} SET ${column} = $2 WHERE ${column} = $1 RETURNING 1`,
          [targetUserId, adminUserId]
        );
        purgedCounts[metricKey] = (purgedCounts[metricKey] || 0) + updatedRows.length;
        continue;
      }

      if (ref.is_nullable === "YES") {
        const updatedRows = await sqlClient.unsafe(
          `UPDATE ${table} SET ${column} = NULL WHERE ${column} = $1 RETURNING 1`,
          [targetUserId]
        );
        purgedCounts[metricKey] = (purgedCounts[metricKey] || 0) + updatedRows.length;
        continue;
      }

      const deletedRows = await sqlClient.unsafe(
        `DELETE FROM ${table} WHERE ${column} = $1 RETURNING 1`,
        [targetUserId]
      );
      purgedCounts[metricKey] = (purgedCounts[metricKey] || 0) + deletedRows.length;
    }
  } catch (error) {
    console.error("[delete-user] Dynamic FK cleanup failed:", error);
    throw error;
  } finally {
    await sqlClient.end({ timeout: 5 });
  }
}

export async function handle(request: Request) {
  try {
    // 1. Validate admin session
    const { user: adminUser } = await getServerUserSession(request);

    if (adminUser.role !== "admin") {
      throw new BusinessRuleError("Unauthorized: Admin access required", 403);
    }

    const text = await request.text();
    const json = JSON.parse(text);
    const input = schema.parse(json);

    // 2. Verify target user exists
    const targetUser = await db
      .selectFrom("users")
      .select(["id", "email", "role"])
      .where("id", "=", input.userId)
      .executeTakeFirst();

    if (!targetUser) {
      throw new BusinessRuleError(`User with ID ${input.userId} not found`, 404);
    }

    // 3. Reject if target user is an admin
    if (targetUser.role === "admin") {
      throw new BusinessRuleError("Cannot delete an admin account", 400);
    }

    if (targetUser.id === adminUser.id) {
      throw new BusinessRuleError("Cannot delete the current admin account", 400);
    }

    // 4. Reject if confirmEmail doesn't match target user's email
    const normalizedTargetEmail = targetUser.email.trim().toLowerCase();
    const normalizedConfirmEmail = input.confirmEmail.trim().toLowerCase();
    if (normalizedTargetEmail !== normalizedConfirmEmail) {
      throw new BusinessRuleError("Confirmation email does not match the target user's email", 400);
    }

    const purgedCounts: Record<string, number> = {};

    // 5. Delete report_artifacts and their cascaded data
    let artifacts: Array<{ id: number }> = [];
    await runOptionalDeleteStep("reportArtifact lookup", async () => {
      artifacts = await db
        .selectFrom("reportArtifact")
        .select("id")
        .where("userId", "=", targetUser.id)
        .execute();
    });

    let deletedReportArtifacts = 0;
    for (const artifact of artifacts) {
      await deleteReportArtifactCascade(artifact.id, adminUser.id, request);
      deletedReportArtifacts++;
    }
    purgedCounts["reportArtifacts"] = deletedReportArtifacts;

    // 6. Delete identity_theft_freeze
    const deleteFreezesResult = await db
      .deleteFrom("identityTheftFreeze")
      .where("userId", "=", targetUser.id)
      .executeTakeFirst();
    purgedCounts["identityTheftFreezes"] = Number(deleteFreezesResult.numDeletedRows || 0);

    // 7. Delete support_ticket and support_ticket_message
    const tickets = await db
      .selectFrom("supportTicket")
      .select("id")
      .where("userId", "=", targetUser.id)
      .execute();

    const ticketIds = tickets.map(t => t.id);

    if (ticketIds.length > 0) {
      const deleteTicketMessagesResult = await db
        .deleteFrom("supportTicketMessage")
        .where((eb) => eb.or([
          eb("ticketId", "in", ticketIds),
          eb("senderId", "=", targetUser.id)
        ]))
        .executeTakeFirst();
      purgedCounts["supportTicketMessages"] = Number(deleteTicketMessagesResult.numDeletedRows || 0);

      const deleteTicketsResult = await db
        .deleteFrom("supportTicket")
        .where("id", "in", ticketIds)
        .executeTakeFirst();
      purgedCounts["supportTickets"] = Number(deleteTicketsResult.numDeletedRows || 0);
    } else {
      // Just in case there are orphaned messages sent by the user
      const deleteTicketMessagesResult = await db
        .deleteFrom("supportTicketMessage")
        .where("senderId", "=", targetUser.id)
        .executeTakeFirst();
      purgedCounts["supportTicketMessages"] = Number(deleteTicketMessagesResult.numDeletedRows || 0);
      purgedCounts["supportTickets"] = 0;
    }

    // 8. Delete consumer_signature
    const deleteSignaturesResult = await db
      .deleteFrom("consumerSignature")
      .where("userId", "=", targetUser.id)
      .executeTakeFirst();
    purgedCounts["consumerSignatures"] = Number(deleteSignaturesResult.numDeletedRows || 0);

    // 9. Delete postal_transaction
    const deletePostalTxResult = await db
      .deleteFrom("postalTransaction")
      .where("userId", "=", targetUser.id)
      .executeTakeFirst();
    purgedCounts["postalTransactions"] = Number(deletePostalTxResult.numDeletedRows || 0);

    // 10. Delete regulatory_notification
    const deleteRegNotifResult = await db
      .deleteFrom("regulatoryNotification")
      .where("userId", "=", targetUser.id)
      .executeTakeFirst();
    purgedCounts["regulatoryNotifications"] = Number(deleteRegNotifResult.numDeletedRows || 0);

    // 11. Delete beta_issue_report
    const deleteBetaIssuesResult = await db
      .deleteFrom("betaIssueReport")
      .where("userId", "=", targetUser.id)
      .executeTakeFirst();
    purgedCounts["betaIssueReports"] = Number(deleteBetaIssuesResult.numDeletedRows || 0);

    // 12. Delete bankruptcy_record
    const deleteBankruptciesResult = await db
      .deleteFrom("bankruptcyRecord")
      .where("userId", "=", targetUser.id)
      .executeTakeFirst();
    purgedCounts["bankruptcyRecords"] = Number(deleteBankruptciesResult.numDeletedRows || 0);

    // 13. Delete subscriptions
    const deleteSubscriptionsResult = await db
      .deleteFrom("subscriptions")
      .where("userId", "=", targetUser.id)
      .executeTakeFirst();
    purgedCounts["subscriptions"] = Number(deleteSubscriptionsResult.numDeletedRows || 0);

    // 14. Delete email_verification_tokens
    const deleteEmailTokensResult = await db
      .deleteFrom("emailVerificationTokens")
      .where("userId", "=", targetUser.id)
      .executeTakeFirst();
    purgedCounts["emailVerificationTokens"] = Number(deleteEmailTokensResult.numDeletedRows || 0);

    // 15. Delete sessions
    const deleteSessionsResult = await db
      .deleteFrom("sessions")
      .where("userId", "=", targetUser.id)
      .executeTakeFirst();
    purgedCounts["sessions"] = Number(deleteSessionsResult.numDeletedRows || 0);

    // 16. Delete oauth_accounts
    const deleteOauthResult = await db
      .deleteFrom("oauthAccounts")
      .where("userId", "=", targetUser.id)
      .executeTakeFirst();
    purgedCounts["oauthAccounts"] = Number(deleteOauthResult.numDeletedRows || 0);

    // 17. Delete password_reset_tokens (optional for older schemas)
    try {
      const deletePasswordResetTokensResult = await db
        .deleteFrom("passwordResetTokens")
        .where("userId", "=", targetUser.id)
        .executeTakeFirst();
      purgedCounts["passwordResetTokens"] = Number(deletePasswordResetTokensResult.numDeletedRows || 0);
    } catch (error) {
      if (!isOptionalSchemaError(error)) {
        throw error;
      }
      purgedCounts["passwordResetTokens"] = 0;
      console.warn(`[delete-user] Skipping passwordResetTokens cleanup due to schema mismatch:`, error);
    }

    // 18. Delete user_passwords
    const deletePasswordsResult = await db
      .deleteFrom("userPasswords")
      .where("userId", "=", targetUser.id)
      .executeTakeFirst();
    purgedCounts["userPasswords"] = Number(deletePasswordsResult.numDeletedRows || 0);

    // 19. Delete user_account
    const deleteUserAccountResult = await db
      .deleteFrom("userAccount")
      .where("userId", "=", targetUser.id)
      .executeTakeFirst();
    purgedCounts["userAccounts"] = Number(deleteUserAccountResult.numDeletedRows || 0);

    // 20. Delete standalone tradelines (created manually without reportArtifact linkage).
    // This prevents FK violations when deleting the user record.
    try {
      const standaloneTradelines = await db
        .selectFrom("tradeline")
        .select("id")
        .where("userId", "=", targetUser.id)
        .execute();

      let deletedStandaloneTradelines = 0;
      for (const tradeline of standaloneTradelines) {
        await db.transaction().execute(async (trx) => {
          await deleteTradeline(trx, tradeline.id, adminUser.id);
        });
        deletedStandaloneTradelines++;
      }
      purgedCounts["standaloneTradelines"] = deletedStandaloneTradelines;
    } catch (error) {
      if (!isOptionalSchemaError(error)) {
        throw error;
      }
      purgedCounts["standaloneTradelines"] = 0;
      console.warn(`[delete-user] Skipping standalone tradeline cleanup due to schema mismatch:`, error);
    }

    // 21. Log the deletion in audit_log as the admin
    await logAudit({
      action: "DELETE",
      entityType: "USER_ACCOUNT",
      entityId: targetUser.id,
      userId: adminUser.id, // The admin doing the deletion
      details: {
        action: "FULL_ACCOUNT_DELETION",
        targetEmail: targetUser.email,
        purgedCounts,
      },
      status: "SUCCESS",
      request,
    });

    // 22. Delete remaining audit_log entries belonging to the deleted user
    const deleteAuditLogResult = await db
      .deleteFrom("auditLog")
      .where("userId", "=", targetUser.id)
      .executeTakeFirst();
    purgedCounts["auditLogs"] = Number(deleteAuditLogResult.numDeletedRows || 0);

    // 22b. SET NULL on FK columns referencing users.id to avoid FK constraint violations on user deletion

    // evidence_attachment.uploaded_by
    const nullifyEvidenceAttachmentResult = await db
      .updateTable("evidenceAttachment")
      .set({ uploadedBy: null })
      .where("uploadedBy", "=", targetUser.id)
      .executeTakeFirst();
    purgedCounts["evidenceAttachmentsNullified"] = Number(nullifyEvidenceAttachmentResult.numUpdatedRows || 0);

    // support_ticket.assigned_agent_id (important for support agents being deleted)
    const nullifySupportTicketAgentResult = await db
      .updateTable("supportTicket")
      .set({ assignedAgentId: null })
      .where("assignedAgentId", "=", targetUser.id)
      .executeTakeFirst();
    purgedCounts["supportTicketsReassigned"] = Number(nullifySupportTicketAgentResult.numUpdatedRows || 0);

    // compliance_config.updated_by_user_id
    const nullifyComplianceConfigResult = await db
      .updateTable("complianceConfig")
      .set({ updatedByUserId: null })
      .where("updatedByUserId", "=", targetUser.id)
      .executeTakeFirst();
    purgedCounts["complianceConfigsNullified"] = Number(nullifyComplianceConfigResult.numUpdatedRows || 0);

    // consumer_signature.verified_by
    const nullifyConsumerSignatureResult = await db
      .updateTable("consumerSignature")
      .set({ verifiedBy: null })
      .where("verifiedBy", "=", targetUser.id)
      .executeTakeFirst();
    purgedCounts["consumerSignaturesVerifiedByNullified"] = Number(nullifyConsumerSignatureResult.numUpdatedRows || 0);

    // parser_known_entity.created_by
    await runOptionalDeleteStep("parserKnownEntity.createdBy nullify", async () => {
      const nullifyParserKnownEntityResult = await db
        .updateTable("parserKnownEntity")
        .set({ createdBy: null })
        .where("createdBy", "=", targetUser.id)
        .executeTakeFirst();
      purgedCounts["parserKnownEntitiesNullified"] = Number(nullifyParserKnownEntityResult.numUpdatedRows || 0);
    });
    purgedCounts["parserKnownEntitiesNullified"] = purgedCounts["parserKnownEntitiesNullified"] ?? 0;

    // parser_field_mapping.created_by
    await runOptionalDeleteStep("parserFieldMapping.createdBy nullify", async () => {
      const nullifyParserFieldMappingResult = await db
        .updateTable("parserFieldMapping")
        .set({ createdBy: null })
        .where("createdBy", "=", targetUser.id)
        .executeTakeFirst();
      purgedCounts["parserFieldMappingsNullified"] = Number(nullifyParserFieldMappingResult.numUpdatedRows || 0);
    });
    purgedCounts["parserFieldMappingsNullified"] = purgedCounts["parserFieldMappingsNullified"] ?? 0;

    // parser_bureau_detection_config.created_by
    await runOptionalDeleteStep("parserBureauDetectionConfig.createdBy nullify", async () => {
      const nullifyParserBureauConfigResult = await db
        .updateTable("parserBureauDetectionConfig")
        .set({ createdBy: null })
        .where("createdBy", "=", targetUser.id)
        .executeTakeFirst();
      purgedCounts["parserBureauConfigsNullified"] = Number(nullifyParserBureauConfigResult.numUpdatedRows || 0);
    });
    purgedCounts["parserBureauConfigsNullified"] = purgedCounts["parserBureauConfigsNullified"] ?? 0;

    // parser_mapping_version.changed_by
    await runOptionalDeleteStep("parserMappingVersion.changedBy nullify", async () => {
      const nullifyParserMappingVersionResult = await db
        .updateTable("parserMappingVersion")
        .set({ changedBy: null })
        .where("changedBy", "=", targetUser.id)
        .executeTakeFirst();
      purgedCounts["parserMappingVersionsNullified"] = Number(nullifyParserMappingVersionResult.numUpdatedRows || 0);
    });
    purgedCounts["parserMappingVersionsNullified"] = purgedCounts["parserMappingVersionsNullified"] ?? 0;

    // parser_test_case.created_by is NOT NULL — reassign to admin user
    await runOptionalDeleteStep("parserTestCase.createdBy reassign", async () => {
      const reassignParserTestCaseResult = await db
        .updateTable("parserTestCase")
        .set({ createdBy: adminUser.id })
        .where("createdBy", "=", targetUser.id)
        .executeTakeFirst();
      purgedCounts["parserTestCasesReassigned"] = Number(reassignParserTestCaseResult.numUpdatedRows || 0);
    });
    purgedCounts["parserTestCasesReassigned"] = purgedCounts["parserTestCasesReassigned"] ?? 0;

    // software_version.created_by
    await runOptionalDeleteStep("softwareVersion.createdBy nullify", async () => {
      const nullifySoftwareVersionResult = await db
        .updateTable("softwareVersion")
        .set({ createdBy: null })
        .where("createdBy", "=", targetUser.id)
        .executeTakeFirst();
      purgedCounts["softwareVersionsNullified"] = Number(nullifySoftwareVersionResult.numUpdatedRows || 0);
    });
    purgedCounts["softwareVersionsNullified"] = purgedCounts["softwareVersionsNullified"] ?? 0;

    // system_settings.updated_by_user_id
    const nullifySystemSettingsResult = await db
      .updateTable("systemSettings")
      .set({ updatedByUserId: null })
      .where("updatedByUserId", "=", targetUser.id)
      .executeTakeFirst();
    purgedCounts["systemSettingsNullified"] = Number(nullifySystemSettingsResult.numUpdatedRows || 0);

    console.log(`FK SET NULL cleanup complete for user ${targetUser.id}`, {
      evidenceAttachmentsNullified: purgedCounts["evidenceAttachmentsNullified"],
      supportTicketsReassigned: purgedCounts["supportTicketsReassigned"],
      complianceConfigsNullified: purgedCounts["complianceConfigsNullified"],
      consumerSignaturesVerifiedByNullified: purgedCounts["consumerSignaturesVerifiedByNullified"],
      parserKnownEntitiesNullified: purgedCounts["parserKnownEntitiesNullified"],
      parserTestCasesReassigned: purgedCounts["parserTestCasesReassigned"],
      softwareVersionsNullified: purgedCounts["softwareVersionsNullified"],
      systemSettingsNullified: purgedCounts["systemSettingsNullified"],
    });

    // 23. Dynamic FK sweep for NO ACTION references to users.id that vary by staging schema.
    await runOptionalDeleteStep("dynamic FK cleanup sweep", async () => {
      await runDynamicUserFkCleanup(targetUser.id, adminUser.id, purgedCounts);
    });

    // 24. Finally, delete the core user record.
    // If we still hit an FK violation, run one more dynamic sweep and retry once.
    let deleteUsersResult;
    try {
      deleteUsersResult = await db
        .deleteFrom("users")
        .where("id", "=", targetUser.id)
        .executeTakeFirst();
    } catch (error) {
      if (!isForeignKeyViolation(error)) {
        throw error;
      }
      console.warn("[delete-user] FK violation on final users delete; retrying after dynamic sweep.", error);
      await runDynamicUserFkCleanup(targetUser.id, adminUser.id, purgedCounts);
      deleteUsersResult = await db
        .deleteFrom("users")
        .where("id", "=", targetUser.id)
        .executeTakeFirst();
    }
    purgedCounts["users"] = Number(deleteUsersResult.numDeletedRows || 0);

    const output: OutputType = {
      success: true,
      deletedEmail: targetUser.email,
      purgedCounts,
    };

    return new Response(JSON.stringify(output satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
