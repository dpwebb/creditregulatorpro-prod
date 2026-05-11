import superjson from "superjson";

import { BusinessRuleError, handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { buildTemplateSnapshot } from "../../../helpers/letterTemplateLifecycle";
import { generateHumanizedLetterTemplate } from "../../../helpers/letterTemplateHumanizeAssist";
import { schema, type OutputType } from "./humanize_POST.schema";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      throw new BusinessRuleError("Admin privileges required", 403);
    }

    const input = schema.parse(superjson.parse(await request.text()));
    const snapshot = buildTemplateSnapshot({
      id: input.id,
      category: input.category,
      templateKey: input.templateKey,
      label: input.label,
      isActive: input.isActive,
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

    const result = await generateHumanizedLetterTemplate({
      snapshot,
      userId: user.id,
      userRole: user.role,
    });

    return new Response(superjson.stringify(result satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}
