import { schema, OutputType, OverdueItem } from "./check-deadlines_POST.schema";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { addDays, differenceInDays } from "../../helpers/dateUtils";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    console.log(`calendar/check-deadlines_POST called by user ${user.id}`);

    const bodyText = await request.text();
    const json = bodyText.trim() ? JSON.parse(bodyText) : {};
    schema.parse(json);

    const now = new Date();
    const overdueItems: OverdueItem[] = [];

    // Fetch active updates that might be overdue
    // We care about DETECTED, UNDER_REVIEW, VERIFIED
    const updates = await db
      .selectFrom("regulatoryUpdateLog")
      .select([
        "id",
        "title",
        "jurisdiction",
        "status",
        "effectiveDate",
        "detectedAt",
        "createdAt"
      ])
      .where("status", "in", ["DETECTED", "UNDER_REVIEW", "VERIFIED"])
      .execute();

    for (const update of updates) {
      // Check 1: Overdue Effective Date
      // If effective date is past and status is not APPLIED/DISMISSED/ARCHIVED (already filtered by query)
      if (update.effectiveDate && new Date(update.effectiveDate) < now) {
        overdueItems.push({
          id: update.id,
          title: update.title,
          jurisdiction: update.jurisdiction,
          type: "EFFECTIVE_DATE_OVERDUE",
          dueDate: new Date(update.effectiveDate).toISOString(),
          daysOverdue: differenceInDays(now, new Date(update.effectiveDate)),
          status: update.status
        });
      }

      // Check 2: Overdue Review Deadline
      // If status is DETECTED and detectedAt + 30 days is past
      if (update.status === "DETECTED" && update.detectedAt) {
        const detectedDate = new Date(update.detectedAt);
        const reviewDeadline = addDays(detectedDate, 30);

        if (reviewDeadline < now) {
          overdueItems.push({
            id: update.id,
            title: update.title,
            jurisdiction: update.jurisdiction,
            type: "REVIEW_OVERDUE",
            dueDate: reviewDeadline.toISOString(),
            daysOverdue: differenceInDays(now, reviewDeadline),
            status: update.status
          });
        }
      }
    }

    // Sort by days overdue (descending)
    overdueItems.sort((a, b) => b.daysOverdue - a.daysOverdue);

    const response: OutputType = {
      criticalCount: overdueItems.length,
      overdueItems,
      checkedAt: now.toISOString()
    };

    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}