import { schema, OutputType } from "./delete_POST.schema";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { deleteLetterTemplate } from "../../../helpers/letterTemplateQueries";
import { BusinessRuleError, handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { db } from "../../../helpers/db";
import { logAudit } from "../../../helpers/auditLogger";
import superjson from "superjson";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      return new Response(superjson.stringify({ error: "Admin privileges required" }), { status: 403 });
    }

    const body = superjson.parse(await request.text());
    const { id } = schema.parse(body);

    const existingTemplate = await db
      .selectFrom("letterTemplate")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!existingTemplate) {
      throw new BusinessRuleError("Template not found", 404);
    }

    await deleteLetterTemplate(id);
    await logAudit({
      action: "DELETE",
      entityType: "SYSTEM",
      entityId: id,
      userId: user.id,
      status: "SUCCESS",
      details: {
        component: "letter_template",
        templateId: id,
        mode: "ARCHIVE",
        before: {
          category: existingTemplate.category,
          templateKey: existingTemplate.templateKey,
          label: existingTemplate.label,
          isActive: existingTemplate.isActive,
        },
      },
      request,
    });

    return new Response(superjson.stringify({ success: true } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}
