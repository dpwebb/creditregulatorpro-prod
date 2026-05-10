import {
  postRetentionEnforcement,
  type InputType as RetentionInput,
  type OutputType as RetentionResult,
} from "../endpoints/admin/retention_POST.schema";
import {
  getRetentionStats,
  type OutputType as RetentionStats,
} from "../endpoints/admin/retention/stats_GET.schema";

export type { RetentionInput, RetentionResult, RetentionStats };

export const runRetentionEnforcement = (body: RetentionInput): Promise<RetentionResult> =>
  postRetentionEnforcement(body);
export { getRetentionStats };

export function getRetentionDeletedCount(result: RetentionResult): number {
  return Object.entries(result).reduce((total, [key, value]) => {
    if (!key.startsWith("deleted") || typeof value !== "number") {
      return total;
    }

    return total + value;
  }, 0);
}
