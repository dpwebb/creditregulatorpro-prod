import { schema, OutputType } from "./update_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { logUpdate } from "../../helpers/auditLogger";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    // Fetch existing freeze to verify ownership and get current state
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

    // Prepare updates
    const updates: any = {
      status: input.status,
      notes: input.notes,
      updatedAt: new Date(),
    };

    if (input.effectiveDate) updates.effectiveDate = input.effectiveDate;
    if (input.thawDate) updates.thawDate = input.thawDate;

    // Auto-set dates based on status changes if not explicitly provided
    if (input.status === "active" && existingFreeze.status !== "active" && !input.effectiveDate) {
      updates.effectiveDate = new Date();
    }

    if (input.status === "thawed" && existingFreeze.status !== "thawed" && !input.thawDate) {
      updates.thawDate = new Date();
    }

    const updatedFreeze = await db
      .updateTable("identityTheftFreeze")
      .set(updates)
      .where("id", "=", input.freezeId)
      .returningAll()
      .executeTakeFirstOrThrow();

    // Log audit
    await logUpdate(
      user.id,
      "USER_ACCOUNT",
      input.freezeId,
      {
        before: { status: existingFreeze.status, notes: existingFreeze.notes },
        after: { status: updatedFreeze.status, notes: updatedFreeze.notes },
      },
      request
    );

    return new Response(JSON.stringify({ freeze: updatedFreeze } satisfies OutputType));
    } catch (error) {
    return handleEndpointError(error);
  }
}