import { schema, OutputType } from "./delete_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { deleteTradeline } from "../../helpers/deleteReportArtifactCascade";
import { logDelete, logAudit } from "../../helpers/auditLogger";
import { Transaction } from "kysely";
import { DB } from "../../helpers/schema";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    
    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    console.log(`Starting cascade delete for tradeline ${input.id} by user ${user.id}`);

    // Check ownership and existence within transaction
    await db.transaction().execute(async (trx: Transaction<DB>) => {
      const tradeline = await trx
        .selectFrom('tradeline')
        .select(['id', 'userId'])
        .where('id', '=', input.id)
        .executeTakeFirst();

      if (!tradeline) {
        throw new BusinessRuleError("Tradeline not found", 404);
      }

      // Check ownership for non-admin users
      if (user.role !== 'admin' && tradeline.userId !== user.id) {
        throw new BusinessRuleError("Forbidden", 403);
      }

      // Cascade delete the tradeline and all associated records
      await deleteTradeline(trx, input.id, user.id);

      // Log the cascade deletion in audit log
      await logDelete(user.id, "TRADELINE", input.id, request);
      
      // Log additional audit entry with cascade details
      await logAudit({
        action: "DELETE",
        entityType: "TRADELINE",
        entityId: input.id,
        userId: user.id,
        details: {
          cascadeDelete: true,
          directTradelineDeletion: true,
        },
        status: "SUCCESS",
        request,
      });
    });

    console.log(`Cascade delete complete for tradeline ${input.id}`);

    return new Response(JSON.stringify({ success: true } satisfies OutputType));
    } catch (error) {
    return handleEndpointError(error);
  }
}