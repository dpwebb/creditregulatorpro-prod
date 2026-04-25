import { schema, OutputType } from "./delete_POST.schema";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { deleteLetterTemplate } from "../../../helpers/letterTemplateQueries";
import { handleEndpointError } from "../../../helpers/endpointErrorHandler";
import superjson from "superjson";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      return new Response(superjson.stringify({ error: "Admin privileges required" }), { status: 403 });
    }

    const body = superjson.parse(await request.text());
    const { id } = schema.parse(body);

    await deleteLetterTemplate(id);

    return new Response(superjson.stringify({ success: true } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}