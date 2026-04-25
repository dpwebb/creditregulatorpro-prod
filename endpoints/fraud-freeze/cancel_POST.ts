import { schema, OutputType } from "./cancel_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { logUpdate } from "../../helpers/auditLogger";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    // Fetch existing freeze
    const existingFreeze = await db
      .selectFrom("identityTheftFreeze")
      .selectAll()
      .where("id", "=", input.freezeId)
      .executeTakeFirst();

    if (!existingFreeze) {
      return new Response(JSON.stringify({ error: "Freeze record not found" }), { status: 404 });
    }

    if (existingFreeze.userId !== user.id && user.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    }

    const updatedFreeze = await db
      .updateTable("identityTheftFreeze")
      .set({
        status: "cancelled",
        updatedAt: new Date(),
      })
      .where("id", "=", input.freezeId)
      .returningAll()
      .executeTakeFirstOrThrow();

    // Log audit
    await logUpdate(
      user.id,
      "USER_ACCOUNT",
      input.freezeId,
      {
        before: { status: existingFreeze.status },
        after: { status: updatedFreeze.status },
      },
      request
    );

    return new Response(JSON.stringify({ success: true } satisfies OutputType));
    } catch (error) {
    return handleEndpointError(error);
  }
}