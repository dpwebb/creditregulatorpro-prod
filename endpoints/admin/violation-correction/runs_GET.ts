import { db } from "../../../helpers/db";
import { handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { isAdmin } from "../../../helpers/userRoleUtils";
import { ensureViolationCorrectionSchema } from "../../../helpers/violationCorrectionSchema";
import { jsonSafe } from "../../../helpers/violationCorrectionManager";
import { schema, OutputType } from "./runs_GET.schema";

function idKey(value: number | string | null | undefined): string | null {
  return value == null ? null : String(value);
}

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 403 });
    }

    await ensureViolationCorrectionSchema();

    const url = new URL(request.url);
    const sourceSha256s = url.searchParams.getAll("sourceSha256");
    const input = schema.parse({
      reviewStatus: url.searchParams.get("reviewStatus") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
      sourceSha256s: sourceSha256s.length > 0 ? sourceSha256s : undefined,
    });

    let runsQuery = db
      .selectFrom("passExtraction")
      .innerJoin("reportArtifact", "reportArtifact.id", "passExtraction.reportArtifactId")
      .select([
        "passExtraction.id",
        "passExtraction.reportArtifactId",
        "passExtraction.pass",
        "passExtraction.status",
        "passExtraction.channelGuess",
        "passExtraction.channelConfidence",
        "passExtraction.completedAt",
        "passExtraction.createdAt",
        "reportArtifact.userId",
        "reportArtifact.reportDate",
        "reportArtifact.createdAt as reportCreatedAt",
      ])
      .orderBy("passExtraction.createdAt", "desc");

    if (input.sourceSha256s !== undefined) {
      runsQuery =
        input.sourceSha256s.length > 0
          ? runsQuery.where("reportArtifact.sha256", "in", input.sourceSha256s)
          : runsQuery.where("passExtraction.id", "=", -1);
    }

    const baseRuns = await runsQuery.execute();

    const runIds = baseRuns.map((run) => run.id);
    const artifactIds = baseRuns.map((run) => run.reportArtifactId);

    const [tradelines, corrections] = await Promise.all([
      artifactIds.length > 0
        ? db
            .selectFrom("tradeline")
            .select(["id", "reportArtifactId"])
            .where("reportArtifactId", "in", artifactIds)
            .execute()
        : Promise.resolve([]),
      runIds.length > 0
        ? db
            .selectFrom("violationCorrection")
            .select(["id", "extractionRunId", "status"])
            .where("extractionRunId", "in", runIds)
            .execute()
        : Promise.resolve([]),
    ]);

    const tradelineIds = tradelines.map((tradeline) => tradeline.id);
    const violations = tradelineIds.length > 0
      ? await db
          .selectFrom("creditorObligationTest")
          .select(["id", "tradelineId"])
          .where("tradelineId", "in", tradelineIds)
          .execute()
      : [];

    const tradelinesByArtifact = new Map<string, number>();
    for (const tradeline of tradelines) {
      const artifactKey = idKey(tradeline.reportArtifactId);
      if (!artifactKey) continue;
      tradelinesByArtifact.set(
        artifactKey,
        (tradelinesByArtifact.get(artifactKey) ?? 0) + 1,
      );
    }

    const artifactIdByTradelineId = new Map<string, string>(
      tradelines.flatMap((tradeline) => {
        const tradelineKey = idKey(tradeline.id);
        const artifactKey = idKey(tradeline.reportArtifactId);
        return tradelineKey && artifactKey ? [[tradelineKey, artifactKey] as const] : [];
      }),
    );
    const violationsByArtifact = new Map<string, number>();
    for (const violation of violations) {
      const tradelineKey = idKey(violation.tradelineId);
      if (!tradelineKey) continue;
      const artifactKey = artifactIdByTradelineId.get(tradelineKey);
      if (!artifactKey) continue;
      violationsByArtifact.set(artifactKey, (violationsByArtifact.get(artifactKey) ?? 0) + 1);
    }

    const correctionsByRun = new Map<string, { total: number; finalized: number }>();
    for (const correction of corrections) {
      const runKey = idKey(correction.extractionRunId);
      if (!runKey) continue;
      const current = correctionsByRun.get(runKey) ?? { total: 0, finalized: 0 };
      current.total += 1;
      if (correction.status === "finalized") current.finalized += 1;
      correctionsByRun.set(runKey, current);
    }

    const allRuns = baseRuns.map((run) => {
      const correctionCounts = correctionsByRun.get(String(run.id)) ?? { total: 0, finalized: 0 };
      const violationCount = violationsByArtifact.get(String(run.reportArtifactId)) ?? 0;
      const tradelineCount = tradelinesByArtifact.get(String(run.reportArtifactId)) ?? 0;
      const needsReviewCount = Math.max(0, violationCount - correctionCounts.finalized);

      return {
        id: run.id,
        reportArtifactId: run.reportArtifactId,
        pass: run.pass,
        status: run.status,
        channelGuess: run.channelGuess,
        channelConfidence: run.channelConfidence,
        reportDate: run.reportDate,
        reportCreatedAt: run.reportCreatedAt,
        completedAt: run.completedAt,
        createdAt: run.createdAt,
        userId: run.userId,
        tradelineCount,
        violationCount,
        correctionCount: correctionCounts.total,
        finalizedCorrectionCount: correctionCounts.finalized,
        needsReviewCount,
      };
    });

    const filtered = allRuns.filter((run) => {
      if (input.reviewStatus === "all") return true;
      if (input.reviewStatus === "finalized") return run.violationCount > 0 && run.needsReviewCount === 0;
      return run.needsReviewCount > 0 || run.correctionCount === 0;
    });

    const offset = input.offset ?? 0;
    const limit = input.limit ?? 25;
    const output: OutputType = {
      runs: filtered.slice(offset, offset + limit),
      total: filtered.length,
    };

    return new Response(JSON.stringify(jsonSafe(output)), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
