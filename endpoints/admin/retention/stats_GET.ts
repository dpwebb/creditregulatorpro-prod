import { schema, OutputType } from "./stats_GET.schema";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { db } from "../../../helpers/db";
import { sql } from "kysely";
import { subYears } from "../../../helpers/dateUtils";
import { handleEndpointError } from "../../../helpers/endpointErrorHandler";

export async function handle(request: Request) {
  try {
    // 1. Authentication & Authorization
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Admin access required" }),
        { status: 403 }
      );
    }

    // 2. Calculate Date Threshold
    const oneYearAgo = subYears(new Date(), 1);

    // 3. Query Eligible Records
    // We run these in parallel for efficiency
    const [
      reportCountResult,
      tradelineCountResult,
      packetCountResult,
      evidenceCountResult,
      lastRunResult
    ] = await Promise.all([
      db
        .selectFrom("reportArtifact")
        .select(db.fn.count("id").as("count"))
        .where("createdAt", "<", oneYearAgo)
        .executeTakeFirst(),
      db
        .selectFrom("tradeline")
        .select(db.fn.count("id").as("count"))
        .where("createdAt", "<", oneYearAgo)
        .executeTakeFirst(),
      db
        .selectFrom("packet")
        .select(db.fn.count("id").as("count"))
        .where("createdAt", "<", oneYearAgo)
        .executeTakeFirst(),
      db
        .selectFrom("evidenceEvent")
        .select(db.fn.count("id").as("count"))
        .where("at", "<", oneYearAgo)
        .executeTakeFirst(),
            db
        .selectFrom("auditLog")
        .select("timestamp")
                        .where((eb) =>
          eb.or([
            eb(sql`details::text`, "like", "%MANUAL_RETENTION_ENFORCEMENT%"),
            eb(sql`details::text`, "like", "%AUTOMATED_RETENTION_PURGE%")
          ])
        )
        .orderBy("timestamp", "desc")
        .limit(1)
        .executeTakeFirst()
    ]);

    const reportCount = Number(reportCountResult?.count ?? 0);
    const tradelineCount = Number(tradelineCountResult?.count ?? 0);
    const packetCount = Number(packetCountResult?.count ?? 0);
    const evidenceCount = Number(evidenceCountResult?.count ?? 0);

    const totalEligible = reportCount + tradelineCount + packetCount + evidenceCount;

    const breakdown = [
      { table: "report_artifact", count: reportCount },
      { table: "tradeline", count: tradelineCount },
      { table: "packet", count: packetCount },
      { table: "evidence_event", count: evidenceCount },
    ];

    // 4. Construct Response
    const responseData: OutputType = {
      eligibleForDeletion: totalEligible,
      breakdown,
      lastRun: lastRunResult?.timestamp ? new Date(lastRunResult.timestamp) : null,
    };

    return new Response(JSON.stringify(responseData satisfies OutputType));
  } catch (error) {
    console.error("Error in retention/stats_GET:", error);
    return handleEndpointError(error);
  }
}