import { schema, OutputType } from "./letter-template_POST.schema";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { upsertLetterTemplate } from "../../helpers/letterTemplateQueries";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import superjson from "superjson";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      return new Response(superjson.stringify({ error: "Admin privileges required" }), { status: 403 });
    }

    const body = superjson.parse(await request.text());
    const input = schema.parse(body);

    const updatedTemplate = await upsertLetterTemplate({
      ...input,
      updatedBy: user.id,
      // mapping undefined to null to satisfy DB insert types for optional/nullable fields
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

    return new Response(superjson.stringify(updatedTemplate satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}