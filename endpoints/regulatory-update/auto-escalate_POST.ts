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

    let escalated = 0;
    let notificationsCreated = 0;
    let statutesLinked = 0;

    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    await db.transaction().execute(async (trx) => {
      // 1. DETECTED -> UNDER_REVIEW
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
            title: "Auto-Escalated to Review",
            message: `Update "${update.title}" has been in DETECTED status for over 3 days.`,
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

      // 2. VERIFIED -> APPLIED
      const verifiedUpdates = await trx
        .selectFrom("regulatoryUpdateLog")
        .selectAll()
        .where("status", "=", "VERIFIED")
        .execute();

      for (const update of verifiedUpdates) {
        const activeRule = await trx
          .selectFrom("dynamicScanningRule")
          .select("id")
          .where("regulatoryUpdateId", "=", update.id)
          .where("status", "=", "ACTIVE")
          .executeTakeFirst();

        if (activeRule) {
          await trx
            .updateTable("regulatoryUpdateLog")
            .set({ status: "APPLIED", appliedAt: now })
            .where("id", "=", update.id)
            .execute();

          await trx
            .insertInto("regulatoryNotification")
            .values({
              title: "Auto-Applied Update",
              message: `Update "${update.title}" was auto-applied because an ACTIVE scanning rule was found.`,
              notificationType: "AUTO_ESCALATION",
              severity: "INFO",
              regulatoryUpdateId: update.id,
              region: "CA",
              isRead: false,
            })
            .execute();

          escalated++;
          notificationsCreated++;

          // Auto-create statute if applicable
          if (update.statutoryReference) {
            const existingStatute = await trx
              .selectFrom("statute")
              .select("id")
              .where("code", "=", update.statutoryReference)
              .executeTakeFirst();

            if (!existingStatute) {
              const newStatute = await trx
                .insertInto("statute")
                .values({
                  code: update.statutoryReference,
                  jurisdiction: update.jurisdiction,
                  region: "CA",
                })
                .returning("id")
                .executeTakeFirstOrThrow();

              await trx
                .insertInto("statuteVersion")
                .values({
                  statuteId: newStatute.id,
                  version: 1,
                  effectiveDate: update.effectiveDate || now,
                  description: update.description,
                  sourceUrl: update.sourceUrl,
                  region: "CA",
                })
                .execute();

              await trx
                .insertInto("regulatoryNotification")
                .values({
                  title: "Statute Auto-Created",
                  message: `A new statute (${update.statutoryReference}) was auto-created from update "${update.title}".`,
                  notificationType: "STATUTE_LINKED",
                  severity: "INFO",
                  regulatoryUpdateId: update.id,
                  region: "CA",
                  isRead: false,
                })
                .execute();

              statutesLinked++;
              notificationsCreated++;
            }
          }
        }
      }

      // 3. Deadline Approaching Notifications
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

        let severity = null;
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

        if (severity) {
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
                message: `Update "${update.title}" has an effective date within ${daysDesc}.`,
                notificationType: "DEADLINE_APPROACHING",
                severity: severity,
                regulatoryUpdateId: update.id,
                region: "CA",
                isRead: false,
              })
              .execute();

            notificationsCreated++;
          }
        }
      }
    });

    return new Response(
      JSON.stringify({
        escalated,
        notificationsCreated,
        statutesLinked,
      } satisfies OutputType)
    );
  } catch (error) {
    console.error("Auto-escalate error:", error);
    return handleEndpointError(error);
  }
}