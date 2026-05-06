/**
 * Legacy DocStrange HTML reparse is intentionally disabled.
 *
 * This helper used to parse stored DocStrange HTML and update persisted tradeline
 * fields by fuzzy matching parsed accounts to existing database rows. That path
 * can silently mutate authoritative ingestion output, so it is hard-isolated as
 * a no-op. Future repairs must be implemented as explicit deterministic parser
 * rules, aliases, validation rules, or regression fixtures.
 */
export async function tradelineReparseSync(
  artifactId: number,
): Promise<{ updated: number; errors: string[] }> {
  void artifactId;
  return { updated: 0, errors: [] };
}
