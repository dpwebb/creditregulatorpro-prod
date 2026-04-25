import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";
import { schema, OutputType } from "./rollback_POST.schema";
import { Selectable } from "kysely";
import { RegulatoryUpdateLog } from "../../helpers/schema";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), { status: 403 });
    }

    const input = schema.parse(JSON.parse(await request.text()));

    let updatedRecord: Selectable<RegulatoryUpdateLog> | null = null;

    await db.transaction().execute(async (trx) => {
      const updateLog = await trx
        .selectFrom("regulatoryUpdateLog")
        .selectAll()
        .where("id", "=", input.id)
        .executeTakeFirst();

      if (!updateLog) {
        throw new Error("Regulatory update not found.");
      }

      if (updateLog.status !== "APPLIED") {
        throw new Error("Only APPLIED updates can be rolled back.");
      }

      updatedRecord = await trx
        .updateTable("regulatoryUpdateLog")
        .set({ status: "VERIFIED", appliedAt: null })
        .where("id", "=", input.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      await trx
        .updateTable("dynamicScanningRule")
        .set({ status: "ARCHIVED" })
        .where("regulatoryUpdateId", "=", input.id)
        .where("status", "in", ["ACTIVE", "PROPOSED"])
        .execute();

      await trx
        .insertInto("regulatoryNotification")
        .values({
          title: "Update Rolled Back",
          message: `Update "${updateLog.title}" was rolled back to VERIFIED. Associated scanning rules were archived.`,
          notificationType: "ROLLBACK",
          severity: "WARNING",
          regulatoryUpdateId: updateLog.id,
          region: "CA",
          isRead: false,
        })
        .execute();
    });

    return new Response(
      JSON.stringify({ update: updatedRecord! } satisfies OutputType)
    );
  } catch (error) {
    console.error("Rollback error:", error);
    return handleEndpointError(error);
  }
}