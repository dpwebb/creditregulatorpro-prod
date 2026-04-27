import { db } from "./db";
import { addDays, differenceInDays } from "./dateUtils";

export async function cronDeadlines(): Promise<void> {
  console.log("Starting cronDeadlines job...");
  try {
    const now = new Date();
    const overdueItems: Array<{
      id: number;
      title: string;
      jurisdiction: string;
      type: "EFFECTIVE_DATE_OVERDUE" | "REVIEW_OVERDUE";
      dueDate: string;
      daysOverdue: number;
      status: string;
    }> = [];

    const updates = await db
      .selectFrom("regulatoryUpdateLog")
      .select([
        "id",
        "title",
        "jurisdiction",
        "status",
        "effectiveDate",
        "detectedAt",
        "createdAt",
      ])
      .where("status", "in", ["DETECTED", "UNDER_REVIEW", "VERIFIED"])
      .execute();

    for (const update of updates) {
      if (update.effectiveDate && new Date(update.effectiveDate) < now) {
        overdueItems.push({
          id: update.id,
          title: update.title,
          jurisdiction: update.jurisdiction,
          type: "EFFECTIVE_DATE_OVERDUE",
          dueDate: new Date(update.effectiveDate).toISOString(),
          daysOverdue: differenceInDays(now, new Date(update.effectiveDate)),
          status: update.status,
        });
      }

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
            status: update.status,
          });
        }
      }
    }

    overdueItems.sort((a, b) => b.daysOverdue - a.daysOverdue);

    console.log(
      `cronDeadlines completed. Found ${overdueItems.length} critical items.`
    );
    if (overdueItems.length > 0) {
      console.log(
        "Overdue items details:",
        JSON.stringify(overdueItems, null, 2)
      );
    }
  } catch (error) {
    console.error("cronDeadlines failed:", error);
  }
}