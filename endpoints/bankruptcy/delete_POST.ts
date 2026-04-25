import { schema, OutputType } from "./delete_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { AuditActionType, AuditEntityType } from "../../helpers/schema";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    // Verify ownership
    const existingRecord = await db
      .selectFrom('bankruptcyRecord')
      .select('id')
      .where('id', '=', input.id)
      .where('userId', '=', user.id)
      .executeTakeFirst();

    if (!existingRecord) {
      return new Response(JSON.stringify({ error: "Record not found or access denied" }), { status: 404 });
    }

    await db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom('bankruptcyRecord')
        .where('id', '=', input.id)
        .execute();

      // Audit Log
      await trx
        .insertInto('auditLog')
        .values({
          userId: user.id,
          actionType: 'DELETE' as AuditActionType,
          entityType: 'BANKRUPTCY_RECORD' as any as AuditEntityType,
          entityId: input.id,
                    details: { deletedId: input.id } as any,
          ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
          status: 'SUCCESS',
          region: 'CA'
        })
        .execute();
    });

    return new Response(JSON.stringify({ success: true } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}