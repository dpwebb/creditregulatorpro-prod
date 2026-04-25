import { schema, OutputType } from "./create_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { logAudit } from "../../helpers/auditLogger";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    // Admin-only endpoint
    if (user.role !== 'admin') {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    }

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    // Enforce CA region policy
    const region = 'CA';

    const newBureau = await db
      .insertInto('bureau')
      .values({
        name: input.name,
        region: region,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        createdAt: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await logAudit({
      action: "SYSTEM_CHANGE",
      entityType: "BUREAU",
      entityId: newBureau.id,
      userId: user.id,
      details: { name: newBureau.name, contactEmail: newBureau.contactEmail },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify({ bureau: newBureau } satisfies OutputType));
  } catch (error) {
    // Handle unique constraint violation (duplicate bureau name)
    if (
      error instanceof Error &&
      'code' in (error as NodeJS.ErrnoException) &&
      (error as NodeJS.ErrnoException).code === '23505'
    ) {
      return new Response(JSON.stringify({ error: "A bureau with this name already exists" }), { status: 409 });
    }
    return handleEndpointError(error);
  }
}