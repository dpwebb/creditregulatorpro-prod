import { db } from "../../../helpers/db";
import { handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { isAdmin } from "../../../helpers/userRoleUtils";
import { ensureViolationCorrectionSchema } from "../../../helpers/violationCorrectionSchema";
import {
  jsonSafe,
  listTradelineArtifactLinks,
} from "../../../helpers/violationCorrectionManager";
import {
  countTradelinesByArtifact,
  countViolationsByArtifact,
} from "../../../helpers/violationCorrectionArtifactLinks";
import { selectCanonicalViolationReviewRuns } from "../../../helpers/violationCorrectionRunSelection";
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
      latestSourceArtifactsOnly: url.searchParams.get("latestSourceArtifactsOnly") === "true",
    });
    const normalizedSourceSha256s = input.sourceSha256s
      ? Array.from(new Set(input.sourceSha256s))
      : undefined;
    const latestSourceArtifactIds =
      normalizedSourceSha256s && input.latestSourceArtifactsOnly
        ? (
            await Promise.all(
              normalizedSourceSha256s.map((sha256) =>
                db
                  .selectFrom("reportArtifact")
                  .select("id")
                  .where("sha256", "=", sha256)
                  .orderBy("createdAt", "desc")
                  .orderBy("id", "desc")
                  .limit(1)
                  .executeTakeFirst(),
              ),
            )
          )
            .map((artifact) => artifact?.id)
            .filter((id): id is number => typeof id === "number")
        : null;

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

    if (normalizedSourceSha256s !== undefined) {
      if (normalizedSourceSha256s.length === 0) {
        runsQuery = runsQuery.where("passExtraction.id", "=", -1);
      } else if (latestSourceArtifactIds) {
        runsQuery =
          latestSourceArtifactIds.length > 0
            ? runsQuery.where("reportArtifact.id", "in", latestSourceArtifactIds)
            : runsQuery.where("passExtraction.id", "=", -1);
      } else {
        runsQuery = runsQuery.where("reportArtifact.sha256", "in", normalizedSourceSha256s);
      }
    }

    const rawRuns = await runsQuery.execute();
    const baseRuns = selectCanonicalViolationReviewRuns(rawRuns);

    const runIds = rawRuns.map((run) => run.id);
    const artifactIds = baseRuns.map((run) => run.reportArtifactId);
    const artifactIdByRunId = new Map(rawRuns.map((run) => [String(run.id), run.reportArtifactId]));

    const [tradelineLinks, corrections] = await Promise.all([
      listTradelineArtifactLinks(artifactIds),
      runIds.length > 0
        ? db
            .selectFrom("violationCorrection")
            .select(["id", "extractionRunId", "status"])
            .where("extractionRunId", "in", runIds)
            .execute()
        : Promise.resolve([]),
    ]);

    const tradelineIds = Array.from(new Set(tradelineLinks.map((link) => link.tradelineId)));
    const violations = tradelineIds.length > 0
      ? await db
          .selectFrom("creditorObligationTest")
          .select(["id", "tradelineId", "technicalDetails"])
          .where("tradelineId", "in", tradelineIds)
          .execute()
      : [];

    const tradelinesByArtifact = countTradelinesByArtifact(tradelineLinks);
    const violationsByArtifact = countViolationsByArtifact(tradelineLinks, violations);

    const correctionsByRun = new Map<string, { total: number; finalized: number }>();
    const correctionsByArtifact = new Map<string, { total: number; finalized: number }>();
    for (const correction of corrections) {
      const runKey = idKey(correction.extractionRunId);
      if (!runKey) continue;
      const current = correctionsByRun.get(runKey) ?? { total: 0, finalized: 0 };
      current.total += 1;
      if (correction.status === "finalized") current.finalized += 1;
      correctionsByRun.set(runKey, current);

      const artifactId = artifactIdByRunId.get(runKey);
      if (!artifactId) continue;
      const artifactKey = String(artifactId);
      const artifactCurrent = correctionsByArtifact.get(artifactKey) ?? { total: 0, finalized: 0 };
      artifactCurrent.total += 1;
      if (correction.status === "finalized") artifactCurrent.finalized += 1;
      correctionsByArtifact.set(artifactKey, artifactCurrent);
    }

    const allRuns = baseRuns.map((run) => {
      const correctionCounts =
        correctionsByArtifact.get(String(run.reportArtifactId)) ??
        correctionsByRun.get(String(run.id)) ??
        { total: 0, finalized: 0 };
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
