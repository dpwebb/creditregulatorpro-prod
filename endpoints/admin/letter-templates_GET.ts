import { OutputType } from "./letter-templates_GET.schema";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { listLetterTemplates } from "../../helpers/letterTemplateQueries";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { LetterTemplateCategoryArrayValues } from "../../helpers/schema";
import { logAudit } from "../../helpers/auditLogger";
import superjson from "superjson";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      return new Response(superjson.stringify({ error: "Admin privileges required" }), { status: 403 });
    }

    const url = new URL(request.url);
    const categoryQuery = url.searchParams.get("category");
    
    let category;
    if (categoryQuery && LetterTemplateCategoryArrayValues.includes(categoryQuery as any)) {
      category = categoryQuery as any;
    }

    const templates = await listLetterTemplates(category);
    await logAudit({
      action: "READ",
      entityType: "SYSTEM",
      userId: user.id,
      status: "SUCCESS",
      details: {
        component: "letter_template",
        mode: "LIST",
        category: category ?? null,
        count: templates.length,
      },
      request,
    });
    return new Response(superjson.stringify(templates satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}
