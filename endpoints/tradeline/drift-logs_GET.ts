import { OutputType, schema } from "./drift-logs_GET.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    const url = new URL(request.url);
    const tradelineIdParam = url.searchParams.get("tradelineId");

    const tradelineId = tradelineIdParam ? parseInt(tradelineIdParam) : undefined;

    const isAdmin = user.role === "admin" || user.role === "support";

    let query = db
      .selectFrom("obligationChallengeLog")
      .leftJoin("reportArtifact", "reportArtifact.id", "obligationChallengeLog.reportArtifactId")
      .leftJoin("tradeline", "tradeline.id", "obligationChallengeLog.tradelineId")
      .leftJoin("creditor", "creditor.id", "tradeline.creditorId")
      .select([
        "obligationChallengeLog.id",
        "obligationChallengeLog.fieldName",
        "obligationChallengeLog.expectedValue",
        "obligationChallengeLog.actualValue",
        "obligationChallengeLog.severity",
        "obligationChallengeLog.message",
        "obligationChallengeLog.detectedAt",
        "obligationChallengeLog.timingDriftDays",
        "obligationChallengeLog.tradelineId",
        "obligationChallengeLog.packetId",
        "obligationChallengeLog.sourceSnapshotId",
        "obligationChallengeLog.comparisonSnapshotId",
        "reportArtifact.reportDate",
        "reportArtifact.artifactType",
        "tradeline.accountNumber",
        "creditor.name as creditorName",
      ]);

    if (!isAdmin) {
      query = query.where("tradeline.userId", "=", user.id);
    }

    if (tradelineId !== undefined) {
      query = query.where("obligationChallengeLog.tradelineId", "=", tradelineId);
    }

    const logs = await query
      .orderBy("obligationChallengeLog.detectedAt", "desc")
      .execute();

    return new Response(JSON.stringify({ logs } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}