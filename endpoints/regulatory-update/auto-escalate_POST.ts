import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";
import { schema, OutputType } from "./auto-escalate_POST.schema";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), { status: 403 });
    }

    schema.parse(JSON.parse((await request.text()) || "{}"));

    let escalated = 0;
    let notificationsCreated = 0;
    const statutesLinked = 0;

    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    await db.transaction().execute(async (trx) => {
      const detectedUpdates = await trx
        .selectFrom("regulatoryUpdateLog")
        .selectAll()
        .where("status", "=", "DETECTED")
        .where("detectedAt", "<=", threeDaysAgo)
        .execute();

      for (const update of detectedUpdates) {
        await trx
          .updateTable("regulatoryUpdateLog")
          .set({ status: "UNDER_REVIEW" })
          .where("id", "=", update.id)
          .execute();

        await trx
          .insertInto("regulatoryNotification")
          .values({
            title: "Review Required",
            message: `Update "${update.title}" has been in DETECTED status for over 3 days. It was moved to UNDER_REVIEW, but no regulation was applied.`,
            notificationType: "AUTO_ESCALATION",
            severity: "WARNING",
            regulatoryUpdateId: update.id,
            region: "CA",
            isRead: false,
          })
          .execute();

        escalated++;
        notificationsCreated++;
      }

      const notAppliedUpdates = await trx
        .selectFrom("regulatoryUpdateLog")
        .selectAll()
        .where("status", "not in", ["APPLIED", "DISMISSED", "ARCHIVED"])
        .where("effectiveDate", "is not", null)
        .execute();

      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
      const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      for (const update of notAppliedUpdates) {
        if (!update.effectiveDate) continue;

        let severity: string | null = null;
        let daysDesc = "";

        if (update.effectiveDate <= thirtyDaysFromNow) {
          severity = "CRITICAL";
          daysDesc = "30 days";
        } else if (update.effectiveDate <= sixtyDaysFromNow) {
          severity = "WARNING";
          daysDesc = "60 days";
        } else if (update.effectiveDate <= ninetyDaysFromNow) {
          severity = "INFO";
          daysDesc = "90 days";
        }

        if (!severity) continue;

        const recentNotif = await trx
          .selectFrom("regulatoryNotification")
          .select("id")
          .where("regulatoryUpdateId", "=", update.id)
          .where("notificationType", "=", "DEADLINE_APPROACHING")
          .where("severity", "=", severity)
          .where("createdAt", ">=", sevenDaysAgo)
          .executeTakeFirst();

        if (!recentNotif) {
          await trx
            .insertInto("regulatoryNotification")
            .values({
              title: "Deadline Approaching",
              message: `Update "${update.title}" has an effective date within ${daysDesc}. Admin approval is still required before it can affect active truth.`,
              notificationType: "DEADLINE_APPROACHING",
              severity,
              regulatoryUpdateId: update.id,
              region: "CA",
              isRead: false,
            })
            .execute();

          notificationsCreated++;
        }
      }
    });

    return new Response(
      JSON.stringify({
        escalated,
        notificationsCreated,
        statutesLinked,
      } satisfies OutputType),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Auto-escalate error:", error);
    return handleEndpointError(error);
  }
}
