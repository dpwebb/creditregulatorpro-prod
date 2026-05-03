import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { db } from "../../../helpers/db";
import { BusinessRuleError, handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { schema, OutputType } from "./rollback_POST.schema";
import superjson from "superjson";
import { upsertLetterTemplate } from "../../../helpers/letterTemplateQueries";
import {
  buildTemplateSnapshot,
  getTemplateChangedFields,
  validateTemplateSnapshot,
} from "../../../helpers/letterTemplateLifecycle";
import { logAudit } from "../../../helpers/auditLogger";

type RollbackAuditDetails = {
  component?: string;
  after?: unknown;
  before?: unknown;
};

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      throw new BusinessRuleError("Admin privileges required", 403);
    }

    const json = superjson.parse(await request.text());
    const input = schema.parse(json);

    const currentTemplate = await db
      .selectFrom("letterTemplate")
      .selectAll()
      .where("id", "=", input.templateId)
      .executeTakeFirst();

    if (!currentTemplate) {
      throw new BusinessRuleError("Template not found", 404);
    }

    const auditLog = await db
      .selectFrom("auditLog")
      .select(["id", "entityId", "details", "status", "entityType"])
      .where("id", "=", input.auditLogId)
      .where("entityType", "=", "SYSTEM")
      .where("entityId", "=", input.templateId)
      .where("status", "=", "SUCCESS")
      .executeTakeFirst();

    if (!auditLog) {
      throw new BusinessRuleError("Rollback history entry not found", 404);
    }

    const details = (auditLog.details || {}) as RollbackAuditDetails;
    if (details.component !== "letter_template") {
      throw new BusinessRuleError("Selected history entry is not a letter-template revision", 400);
    }

    const snapshotCandidate =
      details.after && typeof details.after === "object"
        ? (details.after as Record<string, unknown>)
        : details.before && typeof details.before === "object"
          ? (details.before as Record<string, unknown>)
          : null;

    if (!snapshotCandidate) {
      throw new BusinessRuleError("Selected history entry has no rollback snapshot", 400);
    }

    const nextSnapshot = buildTemplateSnapshot({
      id: currentTemplate.id,
      category:
        (snapshotCandidate.category as typeof currentTemplate.category | undefined) ??
        currentTemplate.category,
      templateKey:
        (typeof snapshotCandidate.templateKey === "string"
          ? snapshotCandidate.templateKey
          : currentTemplate.templateKey) ?? currentTemplate.templateKey,
      label:
        (typeof snapshotCandidate.label === "string"
          ? snapshotCandidate.label
          : currentTemplate.label) ?? currentTemplate.label,
      isActive:
        typeof snapshotCandidate.isActive === "boolean"
          ? snapshotCandidate.isActive
          : Boolean(currentTemplate.isActive),
      subject:
        (snapshotCandidate.subject as string | null | undefined) ?? currentTemplate.subject,
      introduction:
        (snapshotCandidate.introduction as string | null | undefined) ?? currentTemplate.introduction,
      statutoryGrounds:
        (snapshotCandidate.statutoryGrounds as string | null | undefined) ??
        currentTemplate.statutoryGrounds,
      requestedAction:
        (snapshotCandidate.requestedAction as string | null | undefined) ??
        currentTemplate.requestedAction,
      statutoryTimeframe:
        (snapshotCandidate.statutoryTimeframe as string | null | undefined) ??
        currentTemplate.statutoryTimeframe,
      consumerStatementRight:
        (snapshotCandidate.consumerStatementRight as string | null | undefined) ??
        currentTemplate.consumerStatementRight,
      certification:
        (snapshotCandidate.certification as string | null | undefined) ??
        currentTemplate.certification,
      closing: (snapshotCandidate.closing as string | null | undefined) ?? currentTemplate.closing,
      fullBodyOverride:
        (snapshotCandidate.fullBodyOverride as string | null | undefined) ??
        currentTemplate.fullBodyOverride,
      statutoryReference:
        (snapshotCandidate.statutoryReference as string | null | undefined) ??
        currentTemplate.statutoryReference,
      sourceUrl:
        (snapshotCandidate.sourceUrl as string | null | undefined) ?? currentTemplate.sourceUrl,
    });

    const validation = validateTemplateSnapshot(nextSnapshot, "ROLLBACK");
    if (validation.errors.length > 0) {
      throw new BusinessRuleError(`Rollback blocked: ${validation.errors.join(" ")}`);
    }

    const beforeSnapshot = buildTemplateSnapshot({
      ...currentTemplate,
      isActive: Boolean(currentTemplate.isActive),
    });

    const updatedTemplate = await upsertLetterTemplate({
      id: currentTemplate.id,
      category: nextSnapshot.category,
      templateKey: nextSnapshot.templateKey,
      label: nextSnapshot.label,
      isActive: nextSnapshot.isActive,
      subject: nextSnapshot.subject,
      introduction: nextSnapshot.introduction,
      statutoryGrounds: nextSnapshot.statutoryGrounds,
      requestedAction: nextSnapshot.requestedAction,
      statutoryTimeframe: nextSnapshot.statutoryTimeframe,
      consumerStatementRight: nextSnapshot.consumerStatementRight,
      certification: nextSnapshot.certification,
      closing: nextSnapshot.closing,
      fullBodyOverride: nextSnapshot.fullBodyOverride,
      statutoryReference: nextSnapshot.statutoryReference,
      sourceUrl: nextSnapshot.sourceUrl,
      updatedBy: user.id,
    });

    await logAudit({
      action: "UPDATE",
      entityType: "SYSTEM",
      entityId: currentTemplate.id,
      userId: user.id,
      status: "SUCCESS",
      details: {
        component: "letter_template",
        templateId: currentTemplate.id,
        mode: "ROLLBACK",
        rollbackFromAuditLogId: input.auditLogId,
        changedFields: getTemplateChangedFields(beforeSnapshot, nextSnapshot),
        before: beforeSnapshot,
        after: nextSnapshot,
      },
      request,
    });

    return new Response(superjson.stringify({ template: updatedTemplate } satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
