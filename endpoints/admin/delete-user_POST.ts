import { schema, OutputType } from "./delete-user_POST.schema";
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

    // 4. Reject if confirmEmail doesn't match target user's email
    if (targetUser.email !== input.confirmEmail) {
      throw new BusinessRuleError("Confirmation email does not match the target user's email", 400);
    }

    const purgedCounts: Record<string, number> = {};

    // 5. Delete report_artifacts and their cascaded data
    const artifacts = await db
      .selectFrom("reportArtifact")
      .select("id")
      .where("userId", "=", targetUser.id)
      .execute();

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

    // 17. Delete user_passwords
    const deletePasswordsResult = await db
      .deleteFrom("userPasswords")
      .where("userId", "=", targetUser.id)
      .executeTakeFirst();
    purgedCounts["userPasswords"] = Number(deletePasswordsResult.numDeletedRows || 0);

    // 18. Delete user_account
    const deleteUserAccountResult = await db
      .deleteFrom("userAccount")
      .where("userId", "=", targetUser.id)
      .executeTakeFirst();
    purgedCounts["userAccounts"] = Number(deleteUserAccountResult.numDeletedRows || 0);

    // 19. Log the deletion in audit_log as the admin
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

    // 20. Delete remaining audit_log entries belonging to the deleted user
    const deleteAuditLogResult = await db
      .deleteFrom("auditLog")
      .where("userId", "=", targetUser.id)
      .executeTakeFirst();
    purgedCounts["auditLogs"] = Number(deleteAuditLogResult.numDeletedRows || 0);

    // 20b. SET NULL on FK columns referencing users.id to avoid FK constraint violations on user deletion

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
    const nullifyParserKnownEntityResult = await db
      .updateTable("parserKnownEntity")
      .set({ createdBy: null })
      .where("createdBy", "=", targetUser.id)
      .executeTakeFirst();
    purgedCounts["parserKnownEntitiesNullified"] = Number(nullifyParserKnownEntityResult.numUpdatedRows || 0);

    // parser_test_case.created_by is NOT NULL — reassign to admin user
    const reassignParserTestCaseResult = await db
      .updateTable("parserTestCase")
      .set({ createdBy: adminUser.id })
      .where("createdBy", "=", targetUser.id)
      .executeTakeFirst();
    purgedCounts["parserTestCasesReassigned"] = Number(reassignParserTestCaseResult.numUpdatedRows || 0);

    // software_version.created_by
    const nullifySoftwareVersionResult = await db
      .updateTable("softwareVersion")
      .set({ createdBy: null })
      .where("createdBy", "=", targetUser.id)
      .executeTakeFirst();
    purgedCounts["softwareVersionsNullified"] = Number(nullifySoftwareVersionResult.numUpdatedRows || 0);

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

    // 21. Finally, delete the core user record
    const deleteUsersResult = await db
      .deleteFrom("users")
      .where("id", "=", targetUser.id)
      .executeTakeFirst();
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