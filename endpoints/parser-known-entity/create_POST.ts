import { schema, OutputType } from "./create_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Admin access required" }),
        { status: 403 }
      );
    }

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    // Check for duplicates
    const existing = await db
      .selectFrom("parserKnownEntity")
      .select("id")
      .where("entityType", "=", input.entityType)
      .where("value", "=", input.value)
      .executeTakeFirst();

    if (existing) {
      return new Response(
        JSON.stringify({ error: "Entity with this type and value already exists" }),
        { status: 409 }
      );
    }

    const entity = await db
      .insertInto("parserKnownEntity")
      .values({
        entityType: input.entityType,
        value: input.value,
        description: input.description || null,
        createdBy: user.id,
        createdAt: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return new Response(
      JSON.stringify({ entity } satisfies OutputType)
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}