import { db } from "../../helpers/db";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { schema, OutputType } from "./update_POST.schema";
import superjson from "superjson";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      throw new BusinessRuleError("Unauthorized: Admin role required", 403);
    }

    const json = superjson.parse(await request.text());
    const input = schema.parse(json);

    const updateSet: any = { updatedAt: new Date() };
    if (input.weight !== undefined) updateSet.weight = input.weight;
    if (input.isActive !== undefined) updateSet.isActive = input.isActive;

    const marker = await db
      .updateTable("parserBureauDetectionConfig")
      .set(updateSet)
      .where("id", "=", input.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return new Response(superjson.stringify({ marker } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}