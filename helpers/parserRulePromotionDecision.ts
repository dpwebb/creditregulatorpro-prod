import type { Json } from "./schema";

export const EXISTING_ACTIVE_RULE_COVERAGE_MESSAGE =
  "An existing active parser rule already covers this correction.";

export interface ExistingRuleAcceptanceResult {
  decisions: Json;
  changed: boolean;
  hasRemainingPromotableDecisions: boolean;
}

export interface ExistingRulePromotionCandidate {
  decisionId: string;
  status: string | null;
  activatedRuleId: number | null;
  validationSummary: unknown;
  createdBy?: number | null;
  createdAt?: string | Date | null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isPromotableDecision(value: unknown): boolean {
  const decision = stringValue(asRecord(value)?.decision);
  return decision === "corrected" || decision === "missing";
}

function normalizeJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function hasExistingRuleReuseSummary(value: unknown): boolean {
  return asRecord(value)?.reusedExistingRule === true;
}

function normalizeDateString(value: string | Date | null | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  return new Date().toISOString();
}

export function acceptDecisionCoveredByExistingRule(
  decisionsValue: unknown,
  decisionId: string,
  activeRuleId: number,
  userId: number | null,
  acceptedAt = new Date().toISOString(),
): ExistingRuleAcceptanceResult {
  let changed = false;
  const nextDecisions = asArray(decisionsValue).map((entry) => {
    const decision = asRecord(entry);
    if (!decision || stringValue(decision.id) !== decisionId) return entry;

    changed = true;
    return {
      ...decision,
      decision: "accepted",
      acceptedByExistingParserRule: true,
      acceptedByExistingParserRuleId: activeRuleId,
      parserRulePromotionStatus: "existing_rule_reused",
      parserRulePromotionMessage: EXISTING_ACTIVE_RULE_COVERAGE_MESSAGE,
      promotedBy: userId,
      promotedAt: acceptedAt,
    };
  });

  const hasRemainingPromotableDecisions = nextDecisions.some((entry) => {
    const decision = asRecord(entry);
    return Boolean(
      decision &&
        stringValue(decision.id) !== decisionId &&
        isPromotableDecision(decision),
    );
  });

  return {
    decisions: normalizeJson(nextDecisions),
    changed,
    hasRemainingPromotableDecisions,
  };
}

export function acceptDecisionsCoveredByExistingRuleCandidates(
  decisionsValue: unknown,
  candidates: ExistingRulePromotionCandidate[],
): ExistingRuleAcceptanceResult {
  let decisions = decisionsValue;
  let changed = false;
  let hasRemainingPromotableDecisions = asArray(decisionsValue).some(isPromotableDecision);

  for (const candidate of candidates) {
    if (
      candidate.status !== "activated" ||
      candidate.activatedRuleId == null ||
      !hasExistingRuleReuseSummary(candidate.validationSummary)
    ) {
      continue;
    }

    const accepted = acceptDecisionCoveredByExistingRule(
      decisions,
      candidate.decisionId,
      candidate.activatedRuleId,
      candidate.createdBy ?? null,
      normalizeDateString(candidate.createdAt),
    );
    decisions = accepted.decisions;
    changed = changed || accepted.changed;
    hasRemainingPromotableDecisions = accepted.hasRemainingPromotableDecisions;
  }

  return {
    decisions: normalizeJson(decisions),
    changed,
    hasRemainingPromotableDecisions,
  };
}
