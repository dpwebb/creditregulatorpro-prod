import { db } from "./db";
import { sql } from "kysely";
import { DisputeVectorType, DISPUTE_VECTORS } from "./obligationVectors";
import { getSuccessRateByVector } from "./successAnalytics";
import { pressureScore } from "./pressureScore";

const SUCCESS_OUTCOMES = ["DELETED", "CORRECTED", "REMOVED", "UPDATED"];

export interface VectorScoreDetails {
  vector: DisputeVectorType;
  baseScore: number;
  creditorScore: number;
  bureauScore: number;
  recencyScore: number;
  compositeScore: number;
}

export interface VectorRecommendation {
  recommendedVector: DisputeVectorType;
  confidence: number;
  reasoning: string;
  allScores: VectorScoreDetails[];
}

/**
 * Returns a recommended DisputeVectorType based on historical success rates
 * and recency penalties.
 */
export const getDataDrivenVectorRecommendation = async (
  userId: number,
  tradelineId: number
): Promise<VectorRecommendation> => {
  // 1. Fetch Tradeline details (bureauId, creditorId, history)
  const tradeline = await db
    .selectFrom("tradeline")
    .where("id", "=", tradelineId)
    .where("userId", "=", userId)
    .select(["bureauId", "creditorId", "lastDisputeVectors"])
    .executeTakeFirst();

  if (!tradeline) {
    throw new Error(`Tradeline ${tradelineId} not found or access denied.`);
  }

  const lastVectors = (tradeline.lastDisputeVectors as string[]) || [];

  // 2. Fetch Base Success Rates by Vector
  const baseRates = await getSuccessRateByVector(userId);
  const baseRateMap = new Map<string, number>();
  baseRates.forEach((r) => baseRateMap.set(r.vector, r.successRate));

  // 3. Fetch Creditor-Specific Success Rates by Vector
  const creditorRates = tradeline.creditorId
    ? await db
        .selectFrom("successMetric")
        .innerJoin(
          "obligationInstance",
          "successMetric.obligationInstanceId",
          "obligationInstance.id"
        )
        .where("obligationInstance.userId", "=", userId)
        .where("successMetric.creditorId", "=", tradeline.creditorId)
        .where("successMetric.region", "=", "CA")
        .select([
          "successMetric.disputeVector",
          sql<number>`count(*)`.as("total"),
          sql<number>`sum(case when outcome in (${sql.join(
            SUCCESS_OUTCOMES
          )}) then 1 else 0 end)`.as("successes"),
        ])
        .groupBy("successMetric.disputeVector")
        .execute()
    : [];

  const creditorRateMap = new Map<string, number>();
  creditorRates.forEach((r) => {
    const total = Number(r.total);
    creditorRateMap.set(
      r.disputeVector || "Unknown",
      total > 0 ? Number(r.successes) / total : 0
    );
  });

  // 4. Fetch Bureau-Specific Success Rates by Vector
  const bureauRates = tradeline.bureauId
    ? await db
        .selectFrom("successMetric")
        .innerJoin(
          "obligationInstance",
          "successMetric.obligationInstanceId",
          "obligationInstance.id"
        )
        .where("obligationInstance.userId", "=", userId)
        .where("successMetric.bureauId", "=", tradeline.bureauId)
        .where("successMetric.region", "=", "CA")
        .select([
          "successMetric.disputeVector",
          sql<number>`count(*)`.as("total"),
          sql<number>`sum(case when outcome in (${sql.join(
            SUCCESS_OUTCOMES
          )}) then 1 else 0 end)`.as("successes"),
        ])
        .groupBy("successMetric.disputeVector")
        .execute()
    : [];

  const bureauRateMap = new Map<string, number>();
  bureauRates.forEach((r) => {
    const total = Number(r.total);
    bureauRateMap.set(
      r.disputeVector || "Unknown",
      total > 0 ? Number(r.successes) / total : 0
    );
  });

  // 5. Score Each Vector
  const availableVectors = Object.keys(
    DISPUTE_VECTORS
  ) as DisputeVectorType[];

  const allScores: VectorScoreDetails[] = availableVectors.map((vector) => {
    // Base rate fallback to 0.5 if no data
    const baseScore = baseRateMap.get(vector) ?? 0.5;
    
    // Creditor and Bureau rate fallback to baseScore if no specific data exists
    const creditorScore = creditorRateMap.has(vector)
      ? creditorRateMap.get(vector)!
      : baseScore;
    const bureauScore = bureauRateMap.has(vector)
      ? bureauRateMap.get(vector)!
      : baseScore;

    // Recency Score (1 = not recent, 0.5 = 2 rounds ago, 0 = last round)
    let recencyScore = 1;
    const lastUsedIndex = lastVectors.indexOf(vector);
    if (lastUsedIndex === 0) {
      recencyScore = 0; // Used in the immediate last round
    } else if (lastUsedIndex === 1) {
      recencyScore = 0.5; // Used two rounds ago
    }

    // Weighted Formula
    // Base: 0.3, Creditor: 0.3, Bureau: 0.2, Recency: 0.2
    const compositeScore =
      baseScore * 0.3 +
      creditorScore * 0.3 +
      bureauScore * 0.2 +
      recencyScore * 0.2;

    return {
      vector,
      baseScore,
      creditorScore,
      bureauScore,
      recencyScore,
      compositeScore,
    };
  });

  // Sort by highest composite score
  allScores.sort((a, b) => b.compositeScore - a.compositeScore);

  const bestChoice = allScores[0];
  const recommendedVector = bestChoice.vector;

  // Generate a reasoning string
  let reasoning = `Selected ${recommendedVector} with composite score of ${bestChoice.compositeScore.toFixed(2)}. `;
  if (bestChoice.recencyScore < 1) {
    reasoning += "It incurred a recency penalty but still scored highest due to strong historical performance. ";
  }
  if (bestChoice.creditorScore > bestChoice.baseScore) {
    reasoning += "It has a higher-than-average success rate with this specific creditor.";
  }

  return {
    recommendedVector,
    confidence: bestChoice.compositeScore, // Confidence is roughly the composite 0-1 score
    reasoning: reasoning.trim(),
    allScores,
  };
};

export interface EnhancedPressureScoreInput {
  userId: number;
  severity: number;
  likelihood: number;
  leverage: number;
  clockShortness: number;
  creditorId?: number | null;
  bureauId?: number | null;
}

export interface EnhancedPressureScoreResult {
  score: number;
  components: {
    baseScore: number;
    creditorMultiplier: number;
    bureauMultiplier: number;
  };
}

/**
 * Calculates an enhanced pressure score by adjusting the base score
 * with historical success multipliers for the creditor and bureau.
 */
export const enhancedPressureScore = async (
  params: EnhancedPressureScoreInput
): Promise<EnhancedPressureScoreResult> => {
  const { userId, creditorId, bureauId, ...baseParams } = params;

  // 1. Calculate base score using existing helper
  const baseScore = pressureScore(baseParams);

  let creditorMultiplier = 1.0;
  let bureauMultiplier = 1.0;

  // 2. Fetch creditor overall historical success rate
  if (creditorId) {
    const credStats = await db
      .selectFrom("successMetric")
      .innerJoin(
        "obligationInstance",
        "successMetric.obligationInstanceId",
        "obligationInstance.id"
      )
      .where("obligationInstance.userId", "=", userId)
      .where("successMetric.creditorId", "=", creditorId)
      .where("successMetric.region", "=", "CA")
      .select([
        sql<number>`count(*)`.as("total"),
        sql<number>`sum(case when outcome in (${sql.join(
          SUCCESS_OUTCOMES
        )}) then 1 else 0 end)`.as("successes"),
      ])
      .executeTakeFirst();

    const total = Number(credStats?.total || 0);
    const successes = Number(credStats?.successes || 0);
    
    if (total > 0) {
      const rate = successes / total;
      // If historically successful (>50%), increase pressure. If not, decrease slightly.
      // Maps a 0-1 rate to a 0.5-1.5 multiplier range
      creditorMultiplier = 0.5 + rate; 
    }
  }

  // 3. Fetch bureau overall historical success rate
  if (bureauId) {
    const burStats = await db
      .selectFrom("successMetric")
      .innerJoin(
        "obligationInstance",
        "successMetric.obligationInstanceId",
        "obligationInstance.id"
      )
      .where("obligationInstance.userId", "=", userId)
      .where("successMetric.bureauId", "=", bureauId)
      .where("successMetric.region", "=", "CA")
      .select([
        sql<number>`count(*)`.as("total"),
        sql<number>`sum(case when outcome in (${sql.join(
          SUCCESS_OUTCOMES
        )}) then 1 else 0 end)`.as("successes"),
      ])
      .executeTakeFirst();

    const total = Number(burStats?.total || 0);
    const successes = Number(burStats?.successes || 0);
    
    if (total > 0) {
      const rate = successes / total;
      // Maps a 0-1 rate to a 0.5-1.5 multiplier range
      bureauMultiplier = 0.5 + rate;
    }
  }

  // 4. Calculate final score
  const finalScore = baseScore * creditorMultiplier * bureauMultiplier;

  return {
    score: finalScore,
    components: {
      baseScore,
      creditorMultiplier,
      bureauMultiplier,
    },
  };
};