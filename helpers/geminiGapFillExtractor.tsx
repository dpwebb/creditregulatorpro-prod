/**
 * Legacy Gemini tradeline gap-fill compatibility shim.
 *
 * Stored tradeline fields must be repaired by deterministic parser rules,
 * aliases, validation rules, or admin-corrected fixtures. AI-derived gap-fill
 * output cannot update canonical credit data.
 */

export async function gapFillTradelines(
  artifactId: number,
  tradelineIds: number[],
): Promise<{ updated: number; errors: string[] }> {
  void artifactId;
  void tradelineIds;
  return {
    updated: 0,
    errors: ["AI tradeline gap-fill is disabled by deterministic ingestion policy."],
  };
}
