import { VectorHistoryItem, VectorStats } from "../endpoints/tradeline/rotation-history_GET.schema";
import { ALL_VECTORS } from "./rotationStrategy";
import { DisputeVectorType } from "./obligationVectors";

export type VectorEffectiveness = {
  vector: string;
  effectivenessScore: number; // 0-100
  usageCount: number;
  responseRate: number; // 0-1
};

export type RotationRecommendation = {
  vector: string;
  reason: string;
  priority: "high" | "medium" | "low";
  score: number;
};

/**
 * Analyzes vector usage patterns to determine effectiveness.
 * 
 * Effectiveness is calculated based on:
 * - Success outcome rate (weight 0.7)
 * - Response received rate (weight 0.3)
 * - Penalized if usage count is very high but success is low (diminishing returns)
 */
export function analyzeVectorEffectiveness(
  history: VectorHistoryItem[],
  stats: VectorStats[]
): VectorEffectiveness[] {
  return stats.map(stat => {
    const historyItems = history.filter(h => h.vector === stat.vector);
    const responseCount = historyItems.filter(h => h.responseReceived).length;
    const responseRate = stat.totalUses > 0 ? responseCount / stat.totalUses : 0;
    
    // Base score from success rate (0-100)
    let score = (stat.successRate * 70) + (responseRate * 30);
    
    // Diminishing returns penalty: if used > 3 times with < 20% success
    if (stat.totalUses > 3 && stat.successRate < 0.2) {
      score *= 0.5;
    }

    return {
      vector: stat.vector,
      effectivenessScore: Math.round(score),
      usageCount: stat.totalUses,
      responseRate
    };
  });
}

/**
 * Generates recommendations for the next vector to use.
 * 
 * Logic:
 * 1. Exclude the immediately last used vector (blocked).
 * 2. Prioritize vectors that have never been used.
 * 3. Prioritize vectors with high effectiveness scores.
 * 4. Prioritize vectors that haven't been used recently (staleness).
 */
export function getRotationRecommendations(
  history: VectorHistoryItem[],
  stats: VectorStats[],
  blockedVector: string | null
): RotationRecommendation[] {
  const recommendations: RotationRecommendation[] = [];
  
  // Helper to find when a vector was last used (index in history)
  const getLastUsedIndex = (vector: string) => history.findIndex(h => h.vector === vector);

  for (const vector of ALL_VECTORS) {
    // Skip blocked vector
    if (vector === blockedVector) continue;

    const stat = stats.find(s => s.vector === vector);
    const lastIndex = getLastUsedIndex(vector);
    
    let score = 0;
    let reason = "";
    let priority: "high" | "medium" | "low" = "low";

    if (!stat) {
      // Never used
      score = 100;
      reason = "Fresh strategy - never attempted on this tradeline.";
      priority = "high";
    } else {
      // Calculate staleness score (higher index = more stale = better)
      // If lastIndex is -1 (should be covered by !stat check but for safety), treat as fresh
      const staleness = lastIndex === -1 ? 10 : Math.min(lastIndex, 10); 
      
      // Calculate effectiveness impact
      // If it worked before, good. If it failed a lot, maybe avoid or retry after long time.
      const successBonus = stat.successRate * 20;
      
      score = (staleness * 10) + successBonus;

      if (staleness >= 3) {
        reason = `Good rotation candidate. Last used ${staleness} attempts ago.`;
        priority = "medium";
      } else {
        reason = "Recently used. Consider other options for better variation.";
        priority = "low";
      }

      if (stat.successRate > 0.5) {
        reason += " Historically effective.";
        priority = "high";
        score += 20;
      }
    }

    recommendations.push({
      vector,
      reason,
      priority,
      score
    });
  }

  return recommendations.sort((a, b) => b.score - a.score);
}

export function getVectorColor(vector: string): "default" | "primary" | "success" | "warning" | "error" | "info" {
  switch (vector) {
    case "accuracy": return "primary";
    case "completeness": return "info";
    case "method_of_verification": return "warning";
    case "reporting_authority": return "error";
    case "consumer_consent": return "success";
    default: return "default";
  }
}

export function formatVectorName(vector: string): string {
  return vector.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}