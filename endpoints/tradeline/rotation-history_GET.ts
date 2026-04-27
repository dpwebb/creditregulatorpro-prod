import { schema, OutputType, VectorHistoryItem, VectorStats } from "./rotation-history_GET.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";

export async function handle(request: Request) {
  try {
    const url = new URL(request.url);
    const tradelineIdParam = url.searchParams.get("tradelineId");
    
    if (!tradelineIdParam) {
      return new Response(JSON.stringify({ error: "tradelineId is required" }), { status: 400 });
    }

    const input = schema.parse({ tradelineId: parseInt(tradelineIdParam) });

    // Fetch obligation instances for this tradeline that have a dispute vector
    const instances = await db
      .selectFrom("obligationInstance")
      .select([
        "id",
        "disputeVector",
        "challengeSentDate",
        "responseReceivedDate",
        "successOutcome",
        "createdAt"
      ])
      .where("tradelineId", "=", input.tradelineId)
      .where("disputeVector", "is not", null)
      .where("challengeSentDate", "is not", null)
      .orderBy("challengeSentDate", "desc") // Most recent first
      .execute();

    const history: VectorHistoryItem[] = instances.map((inst) => ({
      vector: inst.disputeVector!,
      usedDate: inst.challengeSentDate,
      obligationInstanceId: inst.id,
      responseReceived: !!inst.responseReceivedDate,
      outcome: inst.successOutcome,
      responseDate: inst.responseReceivedDate
    }));

    // Calculate stats
    const statsMap = new Map<string, { total: number; successes: number; lastDate: Date | null }>();

    for (const item of history) {
      const current = statsMap.get(item.vector) || { total: 0, successes: 0, lastDate: null };
      
      current.total += 1;
      if (item.outcome === "SUCCESS" || item.outcome === "DELETED" || item.outcome === "UPDATED") {
        current.successes += 1;
      }
      
      // Since history is ordered desc, the first time we see a vector is its most recent use
      if (!current.lastDate && item.usedDate) {
        current.lastDate = item.usedDate;
      }

      statsMap.set(item.vector, current);
    }

    const stats: VectorStats[] = Array.from(statsMap.entries()).map(([vector, data]) => ({
      vector,
      totalUses: data.total,
      successRate: data.total > 0 ? data.successes / data.total : 0,
      lastUsedDate: data.lastDate
    }));

    // Determine currently blocked vector (most recently used)
    // We use the logic from rotationStrategy helper: "Filter out the immediately preceding vector"
    const currentBlockedVector = history.length > 0 ? history[0].vector : null;

    return new Response(JSON.stringify({
      history,
      stats,
      currentBlockedVector
    } satisfies OutputType));

  } catch (error) {
    return handleEndpointError(error);
  }
}