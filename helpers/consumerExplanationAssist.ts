import { z } from "zod";

import {
  getEnrichedExplanation,
  getEnrichedRecommendedAction,
  simplifyForUser,
} from "./getEnrichedExplanation";
import { getViolationDisplayLabel } from "./getViolationLabel";
import { runOpenAiJsonAssist } from "./aiAssist";

export const AI_CONSUMER_EXPLANATION_FEATURE_KEY = "ai.consumer_explanation_assist";

export interface ConsumerExplanationViolationInput {
  id?: number | null;
  violationCategory?: string | null;
  technicalDetails?: any;
  userExplanation?: string | null;
  responsibleEntity?: "BUREAU" | "CREDITOR" | "COLLECTOR" | string | null;
  recommendedAction?: string | null;
}

export interface ConsumerExplanationTradelineContext {
  creditorName?: string | null;
  bureauName?: string | null;
  accountType?: string | null;
  accountNumber?: string | null;
  collectionAgencyName?: string | null;
  originalCreditorName?: string | null;
  isCollectionAccount?: boolean | null;
}

export interface ConsumerFindingExplanation {
  summary: string;
  whyItMatters: string;
  nextStep: string;
}

export interface ConsumerFindingExplanationResult {
  source: "ai" | "deterministic";
  status: "disabled" | "unavailable" | "ok" | "failed";
  provider: "openai" | "none";
  model: string | null;
  explanation: ConsumerFindingExplanation;
  deterministicFallback: ConsumerFindingExplanation;
  errorCode?: string | null;
}

const aiConsumerExplanationSchema = z.object({
  summary: z.string().min(12).max(700),
  whyItMatters: z.string().min(12).max(700),
  nextStep: z.string().min(12).max(700),
});

const FORBIDDEN_AI_CLAIMS = [
  /\bguarantee(?:d|s)?\b/i,
  /\byou will win\b/i,
  /\bconfirmed legal violation\b/i,
  /\bdefinitely illegal\b/i,
  /\billegal\b/i,
  /\bmust sue\b/i,
  /\bsue them\b/i,
  /\bentitled to damages\b/i,
  /\bpunitive damages\b/i,
];

const FACT_TOKEN_PATTERN =
  /(?:\$\s?\d[\d,]*(?:\.\d{2})?)|\b\d{4}[/-]\d{1,2}[/-]\d{1,2}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/gi;

function normalizeText(text: string): string {
  return simplifyForUser(text)
    .replace(/\s+/g, " ")
    .trim();
}

function extractFactTokens(text: string): Set<string> {
  return new Set((text.match(FACT_TOKEN_PATTERN) ?? []).map((token) => token.toLowerCase()));
}

function assertNoUnsafeClaims(text: string): void {
  const matched = FORBIDDEN_AI_CLAIMS.find((pattern) => pattern.test(text));
  if (matched) {
    throw new Error("ai_consumer_explanation_unsafe_claim");
  }
}

function assertNoNewMoneyOrDateFacts(text: string, allowedFactsText: string): void {
  const allowedTokens = extractFactTokens(allowedFactsText);
  const outputTokens = extractFactTokens(text);

  for (const token of outputTokens) {
    if (!allowedTokens.has(token)) {
      throw new Error("ai_consumer_explanation_new_fact");
    }
  }
}

function maskAccountNumber(accountNumber: string | null | undefined): string | null {
  if (!accountNumber) return null;
  const digits = accountNumber.replace(/\D/g, "");
  if (digits.length >= 4) return `ending in ${digits.slice(-4)}`;
  return "masked";
}

export function buildDeterministicConsumerFindingExplanation(
  violation: ConsumerExplanationViolationInput,
): ConsumerFindingExplanation {
  const summary = normalizeText(getEnrichedExplanation(violation));
  const nextStep = normalizeText(getEnrichedRecommendedAction(violation));

  const category = violation.violationCategory;
  const technicalDetails = violation.technicalDetails ?? {};
  let whyItMatters =
    "Clear and complete account details matter because they are used to decide whether the account should be corrected, verified, or disputed.";

  if (category === "CROSS_BUREAU_INCONSISTENCY") {
    whyItMatters =
      "When two bureaus report different details for the same account, the difference should be explained so you know what to dispute and with whom.";
  } else if (
    category === "MULTIPLE_COLLECTOR_VIOLATION" ||
    category === "COLLECTOR_DUPLICATE_REPORTING"
  ) {
    whyItMatters =
      "Two collection listings for the same debt can make the debt look duplicated or larger than it is, so the reporting needs to be verified.";
  } else if (category === "DOCUMENTATION_CHAIN_FAILURE") {
    whyItMatters =
      technicalDetails?.missingField === "originalCreditorName"
        ? "The original company you owed is important because it helps confirm whether the collection agency is reporting the correct debt."
        : "The company collecting or reporting the debt should be able to show the information that connects the account to you.";
  } else if (technicalDetails?.fieldName || technicalDetails?.missingField) {
    whyItMatters =
      "This field can affect how the account is understood, including whether the balance, date history, or collection status is accurate.";
  }

  return {
    summary: summary || "We found a problem with how this account is reported.",
    whyItMatters: normalizeText(whyItMatters),
    nextStep: nextStep || "Ask them to check the account and fix anything that is wrong.",
  };
}

export function validateAiConsumerFindingExplanation(
  value: unknown,
  allowedFactsText = "",
): ConsumerFindingExplanation {
  const parsed = aiConsumerExplanationSchema.parse(value);
  const normalized: ConsumerFindingExplanation = {
    summary: normalizeText(parsed.summary),
    whyItMatters: normalizeText(parsed.whyItMatters),
    nextStep: normalizeText(parsed.nextStep),
  };

  const combined = `${normalized.summary}\n${normalized.whyItMatters}\n${normalized.nextStep}`;
  assertNoUnsafeClaims(combined);
  assertNoNewMoneyOrDateFacts(combined, allowedFactsText);

  return normalized;
}

export function buildConsumerExplanationAssistInput(
  violation: ConsumerExplanationViolationInput,
  context: ConsumerExplanationTradelineContext = {},
): Record<string, unknown> {
  const technicalDetails = violation.technicalDetails ?? {};
  const fallback = buildDeterministicConsumerFindingExplanation(violation);

  return {
    category: violation.violationCategory ?? null,
    displayLabel: getViolationDisplayLabel(violation as any),
    responsibleEntity: violation.responsibleEntity ?? technicalDetails.responsibleEntity ?? null,
    deterministicExplanation: fallback,
    accountContext: {
      creditorName: context.creditorName ?? technicalDetails.creditorName ?? null,
      bureauName: context.bureauName ?? technicalDetails.bureauName ?? null,
      accountType: context.accountType ?? technicalDetails.accountType ?? null,
      accountNumber: maskAccountNumber(context.accountNumber ?? technicalDetails.accountNumber ?? null),
      collectionAgencyName:
        context.collectionAgencyName ?? technicalDetails.collectionAgencyName ?? null,
      originalCreditorName:
        context.originalCreditorName ?? technicalDetails.originalCreditorName ?? null,
      isCollectionAccount: context.isCollectionAccount ?? technicalDetails.isCollectionAccount ?? null,
    },
    evidenceFields: {
      fieldName: technicalDetails.fieldName ?? technicalDetails.missingField ?? null,
      expectedValue: technicalDetails.expectedValue ?? null,
      actualValue: technicalDetails.actualValue ?? null,
      otherAgencyName: technicalDetails.otherAgencyName ?? null,
      sameAccountNumber: technicalDetails.sameAccountNumber ?? null,
      fieldDifferences: Array.isArray(technicalDetails.fieldDifferences)
        ? technicalDetails.fieldDifferences.slice(0, 6)
        : null,
    },
  };
}

export async function generateConsumerFindingExplanation(params: {
  violation: ConsumerExplanationViolationInput;
  context?: ConsumerExplanationTradelineContext;
  userId?: number | null;
  userRole?: "admin" | "user" | "support" | string | null;
}): Promise<ConsumerFindingExplanationResult> {
  const deterministicFallback = buildDeterministicConsumerFindingExplanation(params.violation);
  const assistInput = buildConsumerExplanationAssistInput(params.violation, params.context);
  const allowedFactsText = JSON.stringify(assistInput);

  const result = await runOpenAiJsonAssist({
    featureKey: AI_CONSUMER_EXPLANATION_FEATURE_KEY,
    subjectType: "creditor_obligation_test",
    subjectId: params.violation.id ?? null,
    userId: params.userId ?? null,
    userRole: params.userRole,
    inputForHash: assistInput,
    systemPrompt: [
      "You rewrite deterministic Canadian credit bureau compliance findings for consumers.",
      "Use plain language and only the facts supplied.",
      "Do not decide legal liability, invent dates or amounts, mention internal rule names, or advise litigation.",
      "Return JSON with summary, whyItMatters, and nextStep.",
    ].join(" "),
    userPrompt: JSON.stringify(assistInput),
    parseOutput: (value) => validateAiConsumerFindingExplanation(value, allowedFactsText),
  });

  if (result.status === "ok" && result.output) {
    return {
      source: "ai",
      status: "ok",
      provider: result.provider,
      model: result.model,
      explanation: result.output,
      deterministicFallback,
    };
  }

  return {
    source: "deterministic",
    status: result.status,
    provider: result.provider,
    model: result.model,
    explanation: deterministicFallback,
    deterministicFallback,
    errorCode: result.errorCode ?? null,
  };
}
