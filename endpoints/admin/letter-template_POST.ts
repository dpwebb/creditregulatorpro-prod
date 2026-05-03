import { schema, OutputType } from "./letter-template_POST.schema";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { upsertLetterTemplate } from "../../helpers/letterTemplateQueries";
import { BusinessRuleError, handleEndpointError } from "../../helpers/endpointErrorHandler";
import { db } from "../../helpers/db";
import { logAudit } from "../../helpers/auditLogger";
import {
  buildTemplateSnapshot,
  getTemplateChangedFields,
  validateTemplateSnapshot,
} from "../../helpers/letterTemplateLifecycle";
import superjson from "superjson";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      return new Response(superjson.stringify({ error: "Admin privileges required" }), { status: 403 });
    }

    const body = superjson.parse(await request.text());
    const input = schema.parse(body);
    const mode = input.mode ?? (input.isActive ? "PUBLISH" : "DRAFT");
    const publishState = mode === "PUBLISH";

    const existingTemplate = input.id
      ? await db
          .selectFrom("letterTemplate")
          .selectAll()
          .where("id", "=", input.id)
          .executeTakeFirst()
      : await db
          .selectFrom("letterTemplate")
          .selectAll()
          .where("category", "=", input.category)
          .where("templateKey", "=", input.templateKey)
          .executeTakeFirst();

    const beforeSnapshot = existingTemplate
      ? buildTemplateSnapshot({
          ...existingTemplate,
          isActive: Boolean(existingTemplate.isActive),
        })
      : null;

    const nextSnapshot = buildTemplateSnapshot({
      id: input.id,
      category: input.category,
      templateKey: input.templateKey,
      label: input.label,
      isActive: publishState,
      subject: input.subject ?? null,
      introduction: input.introduction ?? null,
      statutoryGrounds: input.statutoryGrounds ?? null,
      requestedAction: input.requestedAction ?? null,
      statutoryTimeframe: input.statutoryTimeframe ?? null,
      consumerStatementRight: input.consumerStatementRight ?? null,
      certification: input.certification ?? null,
      closing: input.closing ?? null,
      fullBodyOverride: input.fullBodyOverride ?? null,
      statutoryReference: input.statutoryReference ?? null,
      sourceUrl: input.sourceUrl ?? null,
    });

    const validation = validateTemplateSnapshot(nextSnapshot, mode);
    if (validation.errors.length > 0) {
      throw new BusinessRuleError(validation.errors.join(" "));
    }

    if (mode === "PUBLISH" && validation.unknownPlaceholders.length > 0) {
      throw new BusinessRuleError(
        `Publishing blocked. Resolve unknown placeholders first: ${validation.unknownPlaceholders.join(", ")}`
      );
    }

    const updatedTemplate = await upsertLetterTemplate({
      id: input.id,
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

    const changedFields = getTemplateChangedFields(beforeSnapshot, nextSnapshot);
    await logAudit({
      action: existingTemplate ? "UPDATE" : "CREATE",
      entityType: "SYSTEM",
      entityId: updatedTemplate.id,
      userId: user.id,
      status: "SUCCESS",
      details: {
        component: "letter_template",
        templateId: updatedTemplate.id,
        category: updatedTemplate.category,
        templateKey: updatedTemplate.templateKey,
        mode,
        changedFields,
        warnings: validation.warnings,
        before: beforeSnapshot,
        after: nextSnapshot,
      },
      request,
    });

    return new Response(superjson.stringify(updatedTemplate satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}
