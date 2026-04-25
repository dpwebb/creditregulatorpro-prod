/**
 * Additional violation categories that map to BUREAU entity type.
 * These supplement the existing BUREAU_ prefix and CROSS_BUREAU contains checks.
 */
// This file is no longer used — categorization was inlined into get_GET.ts
export const _UNUSED_BUREAU_VIOLATION_CATEGORIES = new Set<string>([
  // Bureau enforces retention limits
  "STATUTE_OF_LIMITATIONS",
  "STATUTE_APPROACHING",
  // Bureau's investigation timing obligation
  "PROCEDURAL_TIMING_VIOLATION",
  // Bureau investigation response deficiencies
  "RESPONSE_MOV_MISSING",
  "RESPONSE_INCOMPLETE",
  "RESPONSE_NO_DOCUMENTATION",
  "RESPONSE_ADDRESS_MISMATCH",
  "RESPONSE_UNAUTHORIZED",
  // Bureau rubber-stamping investigations
  "INVESTIGATION_RUBBER_STAMP",
  // Bureau stale reporting duty
  "STALE_REPORTING_FAILURE",
  // Bureau suppressing consumer statements
  "CONSUMER_STATEMENT_SUPPRESSION",
  // Bureau's duty on identity theft
  "IDENTITY_THEFT_VIOLATION",
]);

/**
 * Additional violation categories that map to COLLECTOR entity type.
 * These supplement the existing COLLECTOR_ prefix and COLLECTOR contains checks.
 */
export const COLLECTOR_VIOLATION_CATEGORIES = new Set<string>([
  // Collector re-aging zombie debts
  "ZOMBIE_DEBT_RESURRECTION",
]);