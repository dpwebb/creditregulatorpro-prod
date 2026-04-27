import { schema, OutputType } from "./request-thaw_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { logUpdate } from "../../helpers/auditLogger";
import { addDays } from "../../helpers/dateUtils";

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

    // Validate it's an active security freeze
    if (existingFreeze.freezeType !== "security_freeze") {
      return new Response(JSON.stringify({ error: "Only security freezes can be thawed." }), { status: 400 });
    }

    if (existingFreeze.status !== "active") {
      return new Response(JSON.stringify({ error: "Freeze must be active to request a thaw." }), { status: 400 });
    }

    // Calculate thaw dates
    const now = new Date();
    let notes = existingFreeze.notes || "";
    notes += `\n[${now.toISOString()}] Thaw requested. Purpose: ${input.purpose}.`;
    if (input.creditorName) {
      notes += ` Creditor: ${input.creditorName}.`;
    }
    if (input.thawDuration) {
      notes += ` Duration: ${input.thawDuration} days.`;
    }

    // If temporary thaw, we might want to schedule a reminder or auto-re-freeze logic (though auto-re-freeze usually handled by bureau)
    // We'll just update the record to indicate a thaw is requested/active.
    // The prompt says "Create thaw request record (update existing freeze with thaw_date)".
    // We'll set status to 'thawed' (or maybe keep 'active' but set thawDate? Usually 'thawed' implies it's currently open).
    // Let's set status to 'thawed' and set thawDate to now.
    
    const updatedFreeze = await db
      .updateTable("identityTheftFreeze")
      .set({
        status: "thawed",
        thawDate: now,
        notes: notes,
        updatedAt: now,
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
        before: { status: existingFreeze.status, notes: existingFreeze.notes },
        after: { 
          status: updatedFreeze.status, 
          notes: updatedFreeze.notes,
          thawDuration: input.thawDuration,
          purpose: input.purpose,
        },
      },
      request
    );

    return new Response(JSON.stringify({ freeze: updatedFreeze } satisfies OutputType));
    } catch (error) {
    return handleEndpointError(error);
  }
}