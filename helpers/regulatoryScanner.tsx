import type { RegulatoryChangeType, RegulatoryUpdateSource } from "./schema";

export interface ScannedUpdate {
  title: string;
  description: string;
  jurisdiction: string;
  changeType: RegulatoryChangeType;
  source: RegulatoryUpdateSource;
  statutoryReference: string | null;
  effectiveDate: string | null;
  sourceUrl: string | null;
  impactAssessment: string | null;
  actionRequired: string | null;
}

/**
 * Legacy AI regulatory scanning is disabled.
 *
 * Regulation update checks now run through the controlled regulation registry
 * workflow, which only creates review candidates from explicit source text or
 * configured authoritative source hashes. Nothing from an LLM can become
 * regulatory truth or proposed violation logic.
 */
export async function scanForRegulatoryUpdates(existingTitles: string[]): Promise<ScannedUpdate[]> {
  void existingTitles;
  throw new Error(
    "AI regulatory scanning is disabled. Use the regulation registry scan workflow with authoritative source text.",
  );
}
