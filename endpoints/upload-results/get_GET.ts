import { schema, OutputType, CrossReference, CrossReferenceChange, DisputeActivity, DisputeOutcomeSummary } from "./get_GET.schema";
// Violation categories that are bureau's responsibility (not starting with BUREAU_ prefix)
const BUREAU_VIOLATION_CATEGORIES = new Set([
  "STATUTE_OF_LIMITATIONS",
  "STATUTE_APPROACHING",
  "PROCEDURAL_TIMING_VIOLATION",
  "RESPONSE_MOV_MISSING",
  "RESPONSE_INCOMPLETE",
  "RESPONSE_NO_DOCUMENTATION",
  "RESPONSE_ADDRESS_MISMATCH",
  "RESPONSE_UNAUTHORIZED",
  "INVESTIGATION_RUBBER_STAMP",
  "STALE_REPORTING_FAILURE",
  "CONSUMER_STATEMENT_SUPPRESSION",
  "IDENTITY_THEFT_VIOLATION",
]);

// Violation categories that are collector's responsibility (not starting with COLLECTOR_ prefix)
const COLLECTOR_VIOLATION_CATEGORIES = new Set([
  "ZOMBIE_DEBT_RESURRECTION",
]);
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { generateAccessPointsWhenNoViolations, ChallengeAccessPoint } from "../../helpers/challengeAccessPointGenerator";

export async function handle(request: Request) {
  try {
    // 1. Authenticate user
    const { user } = await getServerUserSession(request);

    // 2. Parse input
    const url = new URL(request.url);
    const artifactIdParam = url.searchParams.get("artifactId");

    if (!artifactIdParam) {
      return new Response(JSON.stringify({ error: "artifactId is required" }), { status: 400 });
    }

    const input = schema.parse({ artifactId: parseInt(artifactIdParam, 10) });

    // 3. Fetch Artifact
    const artifact = await db
      .selectFrom("reportArtifact")
      .selectAll()
      .where("id", "=", input.artifactId)
      .executeTakeFirst();

    if (!artifact) {
      return new Response(JSON.stringify({ error: "Artifact not found" }), { status: 404 });
    }

    // Check ownership
    if (user.role !== "admin" && artifact.userId !== user.id) {
      return new Response(JSON.stringify({ error: "Unauthorized access to artifact" }), { status: 403 });
    }

    // 4. Identify Tradelines for current artifact
    let tradelineIds: number[] = [];

    if (artifact.tradelineId) {
      tradelineIds.push(artifact.tradelineId);
    }

    const artifactData = artifact.data as Record<string, unknown> | null;
    const parserQuality = artifactData?.parserQuality as OutputType["parserQuality"] | undefined;
    const parserRequiresReview = Boolean(parserQuality?.requiresManualReview);

    if (artifactData?.tradelineIds && Array.isArray(artifactData.tradelineIds)) {
      tradelineIds = [...new Set([...tradelineIds, ...(artifactData.tradelineIds as number[])])];
    }

    // If no tradelines found linked, we can't find violations
    if (tradelineIds.length === 0) {
      return new Response(JSON.stringify({
        metadata: {
          fileName: (artifactData?.fileName as string) || "Unknown File",
          uploadDate: artifact.createdAt ? new Date(artifact.createdAt) : new Date(),
          region: artifact.region || "CA",
          bureauName: parserQuality?.sourceBureauName || "Unknown",
        },
        stats: {
          totalTradelines: 0,
          highSeverity: parserRequiresReview ? 1 : 0,
          mediumSeverity: 0,
          lowSeverity: 0,
          bureauViolations: parserRequiresReview ? 1 : 0,
          creditorViolations: 0,
          collectorViolations: 0,
          actionableCount: parserRequiresReview ? 1 : 0,
          threatScore: parserRequiresReview ? Math.max(60, 100 - (parserQuality?.confidenceScore ?? 0)) : 0,
          equifaxViolations: 0,
          transunionViolations: 0,
        },
        topFindings: [],
        challengeAccessPoints: generateAccessPointsWhenNoViolations(0),
        ...(parserQuality ? { parserQuality } : {}),
      } satisfies OutputType));
    }

    // 5. Fetch Violations
    const violations = await db
      .selectFrom("creditorObligationTest")
      .innerJoin("tradeline", "creditorObligationTest.tradelineId", "tradeline.id")
      .leftJoin("creditor", "tradeline.creditorId", "creditor.id")
      .leftJoin("bureau", "tradeline.bureauId", "bureau.id")
      .select([
        "creditorObligationTest.id",
        "creditorObligationTest.tradelineId",
        "creditorObligationTest.severity",
        "creditorObligationTest.violationCategory",
        "creditorObligationTest.userStatus",
        "creditorObligationTest.obligationState",
        "creditorObligationTest.obligationType",
        "creditorObligationTest.userExplanation",
        "creditor.name as creditorName",
        "tradeline.accountNumber",
        "bureau.name as bureauName",
      ])
      .where("creditorObligationTest.tradelineId", "in", tradelineIds)
      .execute();

    // 6. Calculate Stats
    let highSeverity = 0;
    let mediumSeverity = 0;
    let lowSeverity = 0;
    let bureauViolations = 0;
    let creditorViolations = 0;
    let collectorViolations = 0;
    let actionableCount = 0;
    let equifaxViolations = 0;
    let transunionViolations = 0;

    for (const v of violations) {
      if (v.severity === "HIGH" || v.severity === "ERROR") highSeverity++;
      else if (v.severity === "MEDIUM" || v.severity === "WARNING") mediumSeverity++;
      else lowSeverity++;

      const category = v.violationCategory || "";
      if (
        BUREAU_VIOLATION_CATEGORIES.has(category) ||
        category.startsWith("BUREAU_") ||
        category.includes("CROSS_BUREAU")
      ) {
        bureauViolations++;
      } else if (
        COLLECTOR_VIOLATION_CATEGORIES.has(category) ||
        category.startsWith("COLLECTOR_") ||
        category.includes("COLLECTOR")
      ) {
        collectorViolations++;
      } else {
        creditorViolations++;
      }

      const isHighSeverity = v.severity === "HIGH" || v.severity === "ERROR";
      const isActiveViolation = !v.userStatus || v.userStatus === "active";
      const isResolvableState =
        !v.obligationState ||
        (v.obligationState !== "PROCEDURALLY_EXHAUSTED" &&
          v.obligationState !== "ADDRESSED_VIA_LINKED_DISPUTE");

      if (isHighSeverity && isActiveViolation && isResolvableState) {
        actionableCount++;
      }

      const bureauNameLower = (v.bureauName ?? "").toLowerCase();
      if (bureauNameLower.includes("equifax")) {
        equifaxViolations++;
      } else if (bureauNameLower.includes("transunion")) {
        transunionViolations++;
      }
    }

    // Threat Score Calculation
    // Formula: (HIGH * 20 + MEDIUM * 10 + LOW * 3) capped at 100
    if (parserRequiresReview) {
      mediumSeverity++;
      bureauViolations++;
      actionableCount++;
    }

    const parserThreatScore = parserRequiresReview ? Math.max(40, 100 - (parserQuality?.confidenceScore ?? 0)) : 0;
    const rawScore = (highSeverity * 20) + (mediumSeverity * 10) + (lowSeverity * 3) + parserThreatScore;
    const threatScore = Math.min(rawScore, 100);

    // Top 5 Findings (Prioritize High Severity)
    const sortedViolations = [...violations].sort((a, b) => {
      const severityWeight = (s: string | null) => {
        if (s === "HIGH" || s === "ERROR") return 3;
        if (s === "MEDIUM" || s === "WARNING") return 2;
        return 1;
      };
      return severityWeight(b.severity) - severityWeight(a.severity);
    });

    const top5 = sortedViolations.slice(0, 5).map(v => ({
      id: Number(v.id),
      tradelineId: Number(v.tradelineId),
      severity: (v.severity as "HIGH" | "MEDIUM" | "LOW") || "LOW",
      creditorName: v.creditorName || "Unknown Creditor",
      violationCategory: v.violationCategory || "Unknown Violation",
      accountNumber: v.accountNumber,
      bureauName: v.bureauName || "Unknown Bureau",
    }));

    // 7. Determine Challenge Access Points
    let challengeAccessPoints: ChallengeAccessPoint[] = [];

    if (violations.length === 0) {
      challengeAccessPoints = generateAccessPointsWhenNoViolations(tradelineIds.length);
      console.log(`No violations found for artifact ${input.artifactId}. Generated ${challengeAccessPoints.length} procedural access points.`);
    } else if (violations.length < 3) {
      const allAccessPoints = generateAccessPointsWhenNoViolations(tradelineIds.length);
      challengeAccessPoints = allAccessPoints
        .filter(ap => ["BUREAU_AUTHORITY", "CREDITOR_AUTHORITY", "CREDITOR_PURPOSE"].includes(ap.id))
        .slice(0, 3);
      console.log(`${violations.length} violations found for artifact ${input.artifactId}. Added ${challengeAccessPoints.length} supplementary access points.`);
    } else {
      challengeAccessPoints = [];
      console.log(`${violations.length} violations found for artifact ${input.artifactId}. No supplementary access points needed.`);
    }

    // 7b. Resolve artifact's bureau name from the first tradeline's bureau
    let artifactBureauName = "Unknown";
    if (tradelineIds.length > 0) {
      const firstTradelineBureau = await db
        .selectFrom("tradeline")
        .leftJoin("bureau", "bureau.id", "tradeline.bureauId")
        .select("bureau.name as bureauName")
        .where("tradeline.id", "=", tradelineIds[0])
        .executeTakeFirst();
      if (firstTradelineBureau?.bureauName) {
        artifactBureauName = firstTradelineBureau.bureauName;
      } else if (artifactData?.bureauName && typeof artifactData.bureauName === "string") {
        artifactBureauName = artifactData.bureauName;
      }
    } else if (artifactData?.bureauName && typeof artifactData.bureauName === "string") {
      artifactBureauName = artifactData.bureauName;
    }

    // 8. Cross-reference with previous report artifact
    const crossReference = await computeCrossReference(
      input.artifactId,
      user.id,
      tradelineIds,
      artifact.createdAt ? new Date(artifact.createdAt) : new Date()
    );

    // 9. Derive dispute outcome summary if crossReference exists
    let disputeOutcomeSummary: DisputeOutcomeSummary | undefined;

    if (crossReference) {
      const removedAfterDispute = crossReference.removed.filter(
        r => r.disputeActivity && r.disputeActivity.length > 0
      ).length;

      const removedUnexplained = crossReference.removed.filter(
        r => !r.disputeActivity || r.disputeActivity.length === 0
      ).length;

      const matchedWithDispute = crossReference.matched.filter(
        m => m.disputeActivity && m.disputeActivity.length > 0
      );

      const unchangedAfterDispute = matchedWithDispute.filter(
        m => m.changes.length === 0 || m.changes.every(c => c.oldValue === null)
      ).length;

      const changedAfterDispute = matchedWithDispute.filter(
        m => m.changes.length > 0 && m.changes.some(c => c.oldValue !== null)
      ).length;

      const allPacketIds = new Set<number>();
      for (const item of [...crossReference.matched, ...crossReference.removed, ...crossReference.added]) {
        if (item.disputeActivity) {
          for (const activity of item.disputeActivity) {
            allPacketIds.add(activity.packetId);
          }
        }
      }
      const totalDisputesSent = allPacketIds.size;

      disputeOutcomeSummary = {
        removedAfterDispute,
        unchangedAfterDispute,
        changedAfterDispute,
        removedUnexplained,
        totalDisputesSent,
      };

      console.log(`Dispute outcome summary for artifact ${input.artifactId}:`, disputeOutcomeSummary);
    }

    // 10. Construct Response
    const result: OutputType = {
      metadata: {
        fileName: (artifactData?.fileName as string) || "Unknown File",
        uploadDate: artifact.createdAt ? new Date(artifact.createdAt) : new Date(),
        region: artifact.region || "CA",
        bureauName: artifactBureauName,
      },
      stats: {
        totalTradelines: tradelineIds.length,
        highSeverity,
        mediumSeverity,
        lowSeverity,
        bureauViolations,
        creditorViolations,
        collectorViolations,
        actionableCount,
        threatScore,
        equifaxViolations,
        transunionViolations,
      },
      topFindings: top5,
      challengeAccessPoints,
      ...(parserQuality ? { parserQuality } : {}),
      ...(crossReference ? { crossReference } : {}),
      ...(disputeOutcomeSummary ? { disputeOutcomeSummary } : {}),
    };

    return new Response(JSON.stringify(result));

  } catch (error) {
    console.error("Error in upload-results/get:", error);
    return handleEndpointError(error);
  }
}

/**
 * Fetches tradeline IDs for a given artifact from the tradelineArtifactPresence table.
 */
async function getTradelineIdsForArtifact(artifactId: number): Promise<number[]> {
  const rows = await db
    .selectFrom("tradelineArtifactPresence")
    .select("tradelineId")
    .where("reportArtifactId", "=", artifactId)
    .execute();
  return rows.map(r => r.tradelineId);
}

/**
 * Queries dispute activity (packets) for a set of tradeline IDs within a date window.
 * Returns a map of tradelineId -> DisputeActivity[].
 */
async function getDisputeActivityByTradeline(
  tradelineIds: number[],
  fromDate: Date,
  toDate: Date
): Promise<Map<number, DisputeActivity[]>> {
  if (tradelineIds.length === 0) return new Map();

  const packets = await db
    .selectFrom("packet")
    .select([
      "packet.id",
      "packet.tradelineId",
      "packet.type",
      "packet.sentDate",
      "packet.status",
      "packet.createdAt",
    ])
    .where("packet.tradelineId", "in", tradelineIds)
    .where("packet.createdAt", ">=", fromDate)
    .where("packet.createdAt", "<=", toDate)
    .execute();

  const result = new Map<number, DisputeActivity[]>();

  for (const packet of packets) {
    if (packet.tradelineId == null) continue;

    const activity: DisputeActivity = {
      packetId: packet.id,
      packetType: packet.type ?? null,
      sentDate: packet.sentDate ? new Date(packet.sentDate).toISOString() : null,
      status: packet.status ?? null,
    };

    const existing = result.get(packet.tradelineId) ?? [];
    existing.push(activity);
    result.set(packet.tradelineId, existing);
  }

  return result;
}

/**
 * Computes the cross-reference between the current artifact's tradelines and the previous artifact's tradelines.
 * Returns null if there's no previous artifact.
 */
/**
 * Fetches a map of tradelineId -> bureauId for a list of tradeline IDs.
 * Tradelines with no bureauId are included with null.
 */
async function getBureauIdsByTradelineIds(
  tradelineIds: number[]
): Promise<Map<number, number | null>> {
  if (tradelineIds.length === 0) return new Map();

  const rows = await db
    .selectFrom("tradeline")
    .select(["id", "bureauId"])
    .where("id", "in", tradelineIds)
    .execute();

  return new Map(rows.map(r => [r.id, r.bureauId ?? null]));
}

async function computeCrossReference(
  currentArtifactId: number,
  userId: number,
  currentTradelineIds: number[],
  currentArtifactCreatedAt: Date
): Promise<CrossReference | null> {
  // --- Step 1: Determine the current artifact's bureau ID(s) FIRST ---
  const currentBureauMap = await getBureauIdsByTradelineIds(currentTradelineIds);
  const currentBureauIds = new Set<number>();
  for (const bureauId of currentBureauMap.values()) {
    if (bureauId !== null) currentBureauIds.add(bureauId);
  }

  console.log(`Current artifact ${currentArtifactId} bureau IDs: [${[...currentBureauIds].join(", ")}]`);

  // --- Step 2: Find the most recent previous artifact FROM THE SAME BUREAU ---
  // We do this by joining through tradelineArtifactPresence -> tradeline to find artifacts
  // that share at least one tradeline from the same bureau(s) as the current artifact.
  let previousArtifact: { id: number; data: unknown; createdAt: Date | string | null } | undefined;

  if (currentBureauIds.size > 0) {
    // Query for the most recent previous artifact that has tradelines belonging to the same bureau(s)
    const sameBureauArtifactRow = await db
      .selectFrom("reportArtifact")
      .innerJoin("tradelineArtifactPresence", "tradelineArtifactPresence.reportArtifactId", "reportArtifact.id")
      .innerJoin("tradeline", "tradeline.id", "tradelineArtifactPresence.tradelineId")
      .select(["reportArtifact.id", "reportArtifact.data", "reportArtifact.createdAt"])
      .where("reportArtifact.userId", "=", userId)
      .where("reportArtifact.id", "!=", currentArtifactId)
      .where("reportArtifact.createdAt", "<", currentArtifactCreatedAt)
      .where("tradeline.bureauId", "in", [...currentBureauIds])
      .orderBy("reportArtifact.createdAt", "desc")
      .limit(1)
      .executeTakeFirst();

    previousArtifact = sameBureauArtifactRow;
  } else {
    // No known bureau for current artifact — fall back to most recent previous artifact overall
    console.log(`Current artifact ${currentArtifactId} has no known bureau IDs. Falling back to most recent previous artifact.`);
    const fallbackArtifactRow = await db
      .selectFrom("reportArtifact")
      .select(["id", "data", "createdAt"])
      .where("userId", "=", userId)
      .where("id", "!=", currentArtifactId)
      .where("createdAt", "<", currentArtifactCreatedAt)
      .orderBy("createdAt", "desc")
      .limit(1)
      .executeTakeFirst();

    previousArtifact = fallbackArtifactRow;
  }

  if (!previousArtifact) {
    console.log(`No same-bureau previous artifact found for user ${userId}, artifact ${currentArtifactId}. Skipping cross-reference.`);
    return null;
  }

  console.log(`Cross-referencing artifact ${currentArtifactId} with same-bureau previous artifact ${previousArtifact.id}`);

  // Use tradelineArtifactPresence table to get the previous artifact's tradeline IDs
  const allPreviousTradelineIds = await getTradelineIdsForArtifact(previousArtifact.id);
  console.log(`Previous artifact ${previousArtifact.id} has ${allPreviousTradelineIds.length} tradelines from presence table.`);

  // --- Bureau-aware filtering (safety net) ---
  // Since we already selected a same-bureau artifact, this should rarely exclude anything,
  // but we keep it as a safety net for tradelines with mixed or null bureau IDs.
  const previousBureauMap = await getBureauIdsByTradelineIds(allPreviousTradelineIds);
  const crossBureauExcluded: number[] = [];
  const previousTradelineIds = allPreviousTradelineIds.filter(id => {
    const bureauId = previousBureauMap.get(id) ?? null;
    // If current artifact has known bureaus, only keep previous tradelines that match one of them
    // Tradelines with null bureauId are kept (bureau unknown — don't exclude them)
    if (currentBureauIds.size > 0 && bureauId !== null && !currentBureauIds.has(bureauId)) {
      crossBureauExcluded.push(id);
      return false;
    }
    return true;
  });

  if (crossBureauExcluded.length > 0) {
    console.log(
      `Bureau-aware cross-reference (safety net): excluded ${crossBureauExcluded.length} tradeline(s) from previous artifact ` +
      `that belong to a different bureau than the current artifact (bureauIds: ${[...currentBureauIds].join(", ")}). ` +
      `Excluded tradelineIds: [${crossBureauExcluded.join(", ")}]`
    );
  }

  const prevArtifactData = previousArtifact.data as Record<string, unknown> | null;
  const previousFileName = (prevArtifactData?.fileName as string) || "Unknown File";
  const previousUploadDate = previousArtifact.createdAt
    ? new Date(previousArtifact.createdAt).toISOString()
    : new Date(0).toISOString();

  const previousArtifactCreatedAt = previousArtifact.createdAt
    ? new Date(previousArtifact.createdAt)
    : new Date(0);

  const currentSet = new Set(currentTradelineIds);
  const previousSet = new Set(previousTradelineIds);

  const matchedIds = currentTradelineIds.filter(id => previousSet.has(id));
  const addedIds = currentTradelineIds.filter(id => !previousSet.has(id));
  const removedIds = previousTradelineIds.filter(id => !currentSet.has(id));

  // Fetch dispute activity for matched and removed tradelines within the window between artifacts
  const disputeRelevantIds = [...matchedIds, ...removedIds];
  const disputeActivityMap = await getDisputeActivityByTradeline(
    disputeRelevantIds,
    previousArtifactCreatedAt,
    currentArtifactCreatedAt
  );

  // --- Matched tradelines: diff key fields + dispute activity ---
  const matched = await computeMatchedDiffs(matchedIds, previousArtifact.id, disputeActivityMap);

  // --- Added tradelines: query current state (no dispute activity needed) ---
  const added = await queryTradelineSummaries(addedIds);

  // --- Removed tradelines: query current DB state + dispute activity ---
  const removed = await queryTradelineSummaries(removedIds, disputeActivityMap);

  return {
    previousArtifactId: previousArtifact.id,
    previousFileName,
    previousUploadDate,
    matched,
    added,
    removed,
  };
}

/**
 * For each matched tradeline ID, query the current tradeline row and the previous snapshot
 * (where reportArtifactId = previousArtifactId) to build a field-level diff.
 * Also attaches dispute activity if available.
 */
async function computeMatchedDiffs(
  matchedIds: number[],
  previousArtifactId: number,
  disputeActivityMap: Map<number, DisputeActivity[]>
) {
  if (matchedIds.length === 0) return [];

  // Fetch current state of matched tradelines (with creditor name)
  const currentRows = await db
    .selectFrom("tradeline")
    .leftJoin("creditor", "creditor.id", "tradeline.creditorId")
    .select([
      "tradeline.id",
      "tradeline.currentBalance",
      "tradeline.status",
      "tradeline.amountPastDue",
      "creditor.name as creditorName",
    ])
    .where("tradeline.id", "in", matchedIds)
    .execute();

  // Fetch previous snapshots for these tradelines from the previous artifact
  const previousSnapshots = await db
    .selectFrom("tradelineSnapshot")
    .select([
      "tradelineId",
      "creditorName",
      "currentBalance",
      "status",
      "amountPastDue",
    ])
    .where("tradelineId", "in", matchedIds)
    .where("reportArtifactId", "=", previousArtifactId)
    .execute();

  // Build a map of tradelineId -> previous snapshot
  const snapshotMap = new Map(previousSnapshots.map(s => [s.tradelineId, s]));

  const DIFF_FIELDS: Array<{
    field: string;
    getCurrent: (row: typeof currentRows[number]) => string | null;
    getPrevious: (snap: typeof previousSnapshots[number]) => string | null;
  }> = [
    {
      field: "creditorName",
      getCurrent: r => r.creditorName ?? null,
      getPrevious: s => s.creditorName ?? null,
    },
    {
      field: "currentBalance",
      getCurrent: r => r.currentBalance != null ? String(r.currentBalance) : null,
      getPrevious: s => s.currentBalance != null ? String(s.currentBalance) : null,
    },
    {
      field: "status",
      getCurrent: r => r.status ?? null,
      getPrevious: s => s.status ?? null,
    },
    {
      field: "amountPastDue",
      getCurrent: r => r.amountPastDue != null ? String(r.amountPastDue) : null,
      getPrevious: s => s.amountPastDue != null ? String(s.amountPastDue) : null,
    },
  ];

  return currentRows.map(current => {
    const snapshot = snapshotMap.get(current.id);
    const changes: CrossReferenceChange[] = [];

    for (const { field, getCurrent, getPrevious } of DIFF_FIELDS) {
      const newValue = getCurrent(current);
      const oldValue = snapshot ? getPrevious(snapshot) : null;

      // Only include if there is an actual change
      if (newValue !== oldValue) {
        changes.push({ field, oldValue, newValue });
      }
    }

    const disputeActivity = disputeActivityMap.get(current.id);

    return {
      tradelineId: current.id,
      creditorName: current.creditorName || "Unknown Creditor",
      changes,
      ...(disputeActivity && disputeActivity.length > 0 ? { disputeActivity } : {}),
    };
  });
}

/**
 * Queries current DB state of tradelines for "added" or "removed" summaries.
 * Optionally attaches dispute activity from the provided map.
 */
async function queryTradelineSummaries(
  ids: number[],
  disputeActivityMap?: Map<number, DisputeActivity[]>
) {
  if (ids.length === 0) return [];

  const rows = await db
    .selectFrom("tradeline")
    .leftJoin("creditor", "creditor.id", "tradeline.creditorId")
    .select([
      "tradeline.id",
      "tradeline.currentBalance",
      "tradeline.status",
      "creditor.name as creditorName",
    ])
    .where("tradeline.id", "in", ids)
    .execute();

  return rows.map(row => {
    const disputeActivity = disputeActivityMap?.get(row.id);
    return {
      tradelineId: row.id,
      creditorName: row.creditorName || "Unknown Creditor",
      currentBalance: row.currentBalance != null ? String(row.currentBalance) : null,
      status: row.status ?? null,
      ...(disputeActivity && disputeActivity.length > 0 ? { disputeActivity } : {}),
    };
  });
}
