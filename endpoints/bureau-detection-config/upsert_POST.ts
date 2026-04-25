import { db } from "../../helpers/db";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { schema, OutputType } from "./upsert_POST.schema";
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

    const isActiveVal = input.isActive ?? true;

    const marker = await db
      .insertInto("parserBureauDetectionConfig")
      .values({
        bureau: input.bureau,
        marker: input.marker,
        weight: input.weight,
        isActive: isActiveVal,
        createdBy: user.id,
        updatedAt: new Date(),
      })
      .onConflict((oc) =>
        oc.columns(["bureau", "marker"]).doUpdateSet({
          weight: input.weight,
          isActive: isActiveVal,
          updatedAt: new Date(),
        })
      )
      .returningAll()
      .executeTakeFirstOrThrow();

    return new Response(superjson.stringify({ marker } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}