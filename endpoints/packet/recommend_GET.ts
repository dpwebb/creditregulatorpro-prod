import { schema, OutputType } from "./recommend_GET.schema";

import { db } from "../../helpers/db";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getDisputeVectorSuggestion } from "../../helpers/violationToDisputeVector";
import { mapViolationToDisputeReason } from "../../helpers/equifaxDisputeReasons";
import { shouldSuppressStaleReportingViolation } from "../../helpers/staleReportingGuard";
import {
  buildPacketRecommendationActionPlan,
  evaluatePacketReadiness,
} from "../../helpers/packetReadiness";
import { evaluateViolationPacketConfidenceGate } from "../../helpers/violationPacketConfidenceGate";
import { buildPacketRecommendationReviewContext } from "../../helpers/packetRecommendationReviewContext";
import {
  generateAccessPointsForTradelines,
  generateAccessPointsWhenNoViolations,
  SimpleTradeline,
} from "../../helpers/challengeAccessPointGenerator";

/**
 * Translates a violation category into a grade-8 reading level plain language description.
 */
function getPlainLanguageDescription(category: string | null): string {
  if (!category) return "An unspecified compliance issue was detected.";
  
  switch (category) {
    case "TEMPORAL_MANIPULATION":
    case "FURNISHER_REAGING_VIOLATION":
    case "RETROACTIVE_HISTORY_MANIPULATION":
    case "LAST_ACTIVITY_DATE_MANIPULATION":
      return "The dates reported on this account appear inconsistent with mapped reporting authority, which could unfairly extend how long it stays on your credit report.";
    case "BALANCE_CALCULATION_VIOLATION":
    case "CLOSED_ACCOUNT_BALANCE_INFLATION":
    case "CREDIT_LIMIT_MANIPULATION":
      return "The balance or credit limit reported for this account appears to be calculated incorrectly or inflated.";
    case "STATUTE_OF_LIMITATIONS":
    case "COLLECTOR_STATUTE_REVIVAL_ATTEMPT":
      return "This account may be past the legal time limit (statute of limitations) for reporting or collection.";
    case "IDENTITY_THEFT_VIOLATION":
    case "BUREAU_ACCESS_VIOLATION":
      return "There are signs that this account may be associated with unauthorized access or identity theft.";
    case "DOCUMENTATION_CHAIN_FAILURE":
    case "PHANTOM_DEBT_UNVERIFIABLE":
    case "ZOMBIE_DEBT_RESURRECTION":
      return "The collector or creditor seems to lack the proper documentation to prove they legally own or can collect this debt.";
    case "ACCOUNT_STATUS_INCONSISTENCY":
    case "FURNISHER_STATUS_CODE_MISMATCH":
      return "The account status (like whether it's open, closed, or in collection) is being reported inconsistently.";
    case "CROSS_ENTITY_DISCREPANCY":
    case "CROSS_BUREAU_INCONSISTENCY":
      return "This account is being reported differently to different credit bureaus, which may not align with mapped accuracy authority.";
    case "METRO2_FIELD_VIOLATIONS":
    case "DATE_LOGIC_IMPOSSIBLE":
      return "The technical data fields provided by the creditor contain impossible or contradictory information.";
    case "COLLECTOR_DUPLICATE_REPORTING":
    case "MULTIPLE_COLLECTOR_VIOLATION":
      return "Multiple collectors are reporting the exact same debt, which unfairly damages your credit score twice.";
    default:
      return "A procedural or reporting issue was detected with mapped Canadian consumer reporting authority.";
  }
}

function selectBundledTopRecommendations<T extends { tradelineId: number; score: number; violationId: number }>(
  recommendations: T[],
  limit: number
): T[] {
  if (recommendations.length <= limit) {
    return [...recommendations].sort((a, b) => b.score - a.score);
  }

  const sorted = [...recommendations].sort((a, b) => b.score - a.score);
  const selected: T[] = [];
  const seenTradelineIds = new Set<number>();

  // Pass 1: maximize tradeline coverage to avoid stacking all top slots on one tradeline.
  for (const recommendation of sorted) {
    if (selected.length >= limit) break;
    if (seenTradelineIds.has(recommendation.tradelineId)) continue;
    selected.push(recommendation);
    seenTradelineIds.add(recommendation.tradelineId);
  }

  // Pass 2: fill any remaining slots with next-highest scores.
  if (selected.length < limit) {
    const selectedViolationIds = new Set(selected.map((item) => item.violationId));
    for (const recommendation of sorted) {
      if (selected.length >= limit) break;
      if (selectedViolationIds.has(recommendation.violationId)) continue;
      selected.push(recommendation);
      selectedViolationIds.add(recommendation.violationId);
    }
  }

  return selected;
}

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    // 1. Fetch user's tradelines with linked creditor and bureau info
    const tradelines = await db
      .selectFrom("tradeline")
      .leftJoin("creditor", "creditor.id", "tradeline.creditorId")
      .leftJoin("bureau", "bureau.id", "tradeline.bureauId")
      .where("tradeline.userId", "=", user.id)
      .select([
        "tradeline.id",
        "tradeline.accountNumber",
        "tradeline.status",
        "tradeline.dateClosed",
        "tradeline.datePaidSettled",
        "tradeline.isCollectionAccount",
        "tradeline.collectionAgencyName",
        "tradeline.accountType",
        "tradeline.reportArtifactId",
        "creditor.name as creditorName",
        "bureau.id as bureauId",
        "bureau.name as bureauName",
        "bureau.address as bureauAddress",
        "bureau.addressLine1 as bureauAddressLine1",
        "bureau.city as bureauCity",
        "bureau.province as bureauProvince",
        "bureau.postalCode as bureauPostalCode",
      ])
      .execute();

    const totalTradelines = tradelines.length;
    
    // Quick exit if no tradelines
    if (totalTradelines === 0) {
      return new Response(
        JSON.stringify({
          recommendations: [],
          proceduralOptions: generateAccessPointsWhenNoViolations(0),
          hasViolations: false,
          totalTradelines: 0,
        } satisfies OutputType)
      );
    }

    const tlIds = tradelines.map((t) => t.id);

    let userAccount = await db
      .selectFrom("userAccount")
      .where("userId", "=", user.id)
      .selectAll()
      .executeTakeFirst();

    if (!userAccount) {
      userAccount = await db
        .selectFrom("userAccount")
        .where("email", "=", user.email)
        .selectAll()
        .executeTakeFirst();
    }

    // 2. Fetch violations associated with these tradelines that are NOT procedurally exhausted
    const violations = await db
      .selectFrom("creditorObligationTest")
      .where("tradelineId", "in", tlIds)
      .where((eb) =>
        eb.or([
          eb("obligationState", "is", null),
          eb("obligationState", "not in", [
            "PROCEDURALLY_EXHAUSTED",
            "ADDRESSED_VIA_LINKED_DISPUTE",
          ]),
        ])
      )
      .selectAll()
      .execute();

    // 3. Exclude tradelines that already have an active packet for the same violation
    const activePackets = await db
      .selectFrom("packet")
      .where("userId", "=", user.id)
      .where("status", "in", ["ready", "sent", "Ready", "Sent", "READY", "SENT"])
      .where("creditorObligationTestId", "is not", null)
      .select(["tradelineId", "creditorObligationTestId"])
      .execute();

    const activeSet = new Set(
      activePackets.map(
        (p) => `${p.tradelineId}-${p.creditorObligationTestId}`
      )
    );

    const availableViolations = violations.filter(
      (v) => v.tradelineId && !activeSet.has(`${v.tradelineId}-${v.id}`)
    );
    const eligibleViolations = availableViolations.filter((v) => {
      if (!v.tradelineId) return false;
      const tl = tradelines.find((t) => t.id === v.tradelineId);
      if (!tl) return false;
      return !shouldSuppressStaleReportingViolation(v.violationCategory, {
        status: tl.status,
        dateClosed: tl.dateClosed,
        datePaidSettled: tl.datePaidSettled,
        isCollectionAccount: tl.isCollectionAccount,
        collectionAgencyName: tl.collectionAgencyName,
        accountType: tl.accountType,
      });
    });

    // Build the bonus map for multiple violations on the same tradeline
    const violationCounts: Record<number, number> = {};
    for (const v of eligibleViolations) {
      if (v.tradelineId) {
        violationCounts[v.tradelineId] = (violationCounts[v.tradelineId] || 0) + 1;
      }
    }

    const recommendations: OutputType extends { recommendations: infer R } | { error: string } ? R : never = [];

    // 4. Process each available violation, compute score, and map properties
    for (const v of eligibleViolations) {
      if (!v.tradelineId) continue;
      
      const tl = tradelines.find((t) => t.id === v.tradelineId);
      if (!tl) continue;

      // Scoring logic
      const severityWeight =
        v.severity === "ERROR" ? 3 : v.severity === "WARNING" ? 2 : 1;
        
      const rawConfidence =
        v.confidenceScore != null ? Number(v.confidenceScore) : 50;
      // confidenceScore is persisted as 0-100 by the compliance scanner.
      // Normalize to 0-1 for consistent scoring and confidence-level buckets.
      const confScore = Math.max(
        0,
        Math.min(1, rawConfidence > 1 ? rawConfidence / 100 : rawConfidence)
      );
        
      const count = violationCounts[v.tradelineId] || 1;
      const bonus = Math.min(0.5, (count - 1) * 0.1);
      
      // SOL violations are legally dispositive — the account MUST be removed once
      // the retention period has expired. Apply a 2x multiplier to ensure they rank
      // above documentation chain failures even when confidence is slightly lower.
      const solMultiplier =
        v.violationCategory === "STATUTE_OF_LIMITATIONS" ||
        v.violationCategory === "COLLECTOR_STATUTE_REVIVAL_ATTEMPT"
          ? 2
          : 1;

      const score = severityWeight * confScore * (1 + bonus) * solMultiplier;

      // Confidence level grouping
      let confidenceLevel: "good" | "fair" | "procedural" = "procedural";
      if (confScore >= 0.7) confidenceLevel = "good";
      else if (confScore >= 0.4) confidenceLevel = "fair";

      // Formatted name
      const safeAccountNum = tl.accountNumber || "????";
      const lastFour = safeAccountNum.length > 4 ? safeAccountNum.slice(-4) : safeAccountNum;
      const tradelineName = `${tl.creditorName || "Unknown Creditor"} (ending in ${lastFour})`;

      // Extract and shape dispute vectors and reasons
      const parsedDetails = v.technicalDetails as { fieldName?: string } | null;
      
      const suggestion = getDisputeVectorSuggestion({
        violationCategory: v.violationCategory,
        recommendedAction: v.recommendedAction,
        technicalDetails: parsedDetails,
      });

      const reasonCode = mapViolationToDisputeReason(
        v.violationCategory,
        parsedDetails
      );
      const packetConfidenceGate = evaluateViolationPacketConfidenceGate({
        technicalDetails: v.technicalDetails,
        validationStatus: v.validationStatus,
        userStatus: v.userStatus,
      });
      const reviewContext = buildPacketRecommendationReviewContext({
        tradelineId: tl.id,
        violationId: v.id,
        packetConfidenceGate,
        technicalDetails: v.technicalDetails,
        reportArtifactId: tl.reportArtifactId,
      });

      recommendations.push({
        tradelineId: tl.id,
        tradelineName,
        bureauId: tl.bureauId,
        bureauName: tl.bureauName,
        violationId: v.id,
        violationCategory: v.violationCategory || "UNKNOWN",
        violationDescription: getPlainLanguageDescription(v.violationCategory),
        suggestedDisputeVector: suggestion.vector,
        suggestedReasonCode: reasonCode,
        reasoning: suggestion.reason,
        score,
        confidenceLevel,
        actionPlan: buildPacketRecommendationActionPlan(
          evaluatePacketReadiness({
            userAccount,
            bureau: {
              name: tl.bureauName,
              address: tl.bureauAddress,
              addressLine1: tl.bureauAddressLine1,
              city: tl.bureauCity,
              province: tl.bureauProvince,
              postalCode: tl.bureauPostalCode,
            },
          }),
          packetConfidenceGate,
        ),
        reviewContext,
      });
    }

    // 5. Rank by score with tradeline bundling, then cap to top 3
    const top3 = selectBundledTopRecommendations(recommendations, 3);

    // 6. If no valid violations, return procedural alternatives
    let proceduralOptions = null;
    if (top3.length === 0) {
      const simpleTradelines: SimpleTradeline[] = tradelines.map((t) => ({
        id: t.id,
        creditorName: t.creditorName || "Unknown Creditor",
        accountNumber: t.accountNumber,
        status: t.status,
        bureauCode: t.bureauName,
      }));
      proceduralOptions = generateAccessPointsForTradelines(simpleTradelines);
    }

    return new Response(
      JSON.stringify({
        recommendations: top3,
        proceduralOptions,
        hasViolations: eligibleViolations.length > 0,
        totalTradelines,
      } satisfies OutputType)
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}
