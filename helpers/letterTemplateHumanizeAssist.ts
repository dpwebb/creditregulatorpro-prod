import { z } from "zod";

import { AI_LETTER_TEMPLATE_HUMANIZE_FEATURE_KEY } from "./aiAssistConstants";
import {
  runOpenAiJsonAssist,
  type AiAssistResult,
} from "./aiAssist";
import {
  buildTemplateSnapshot,
  validateTemplateSnapshot,
  type LetterTemplateSnapshot,
  type TemplateValidationResult,
} from "./letterTemplateLifecycle";

type TemplateTextField =
  | "subject"
  | "introduction"
  | "requestedAction"
  | "statutoryTimeframe"
  | "consumerStatementRight"
  | "certification"
  | "closing"
  | "fullBodyOverride";

export interface LetterTemplateHumanizeResult {
  source: "ai" | "deterministic";
  status: AiAssistResult<LetterTemplateSnapshot>["status"];
  provider: "openai" | "none";
  model: string | null;
  template: LetterTemplateSnapshot;
  validation: TemplateValidationResult;
  errorCode?: string | null;
}

const TEMPLATE_TEXT_FIELDS: TemplateTextField[] = [
  "subject",
  "introduction",
  "requestedAction",
  "statutoryTimeframe",
  "consumerStatementRight",
  "certification",
  "closing",
  "fullBodyOverride",
];

const TOKEN_PATTERN = /{{\s*([a-zA-Z0-9_.]+)\s*}}/g;

const aiRewriteSchema = z.object({
  subject: z.string().nullable().optional(),
  introduction: z.string().nullable().optional(),
  requestedAction: z.string().nullable().optional(),
  statutoryTimeframe: z.string().nullable().optional(),
  consumerStatementRight: z.string().nullable().optional(),
  certification: z.string().nullable().optional(),
  closing: z.string().nullable().optional(),
  fullBodyOverride: z.string().nullable().optional(),
});

const UNSAFE_TEMPLATE_CLAIMS = [
  /\bguarantee(?:d|s)?\b/i,
  /\b100%\s+accurate\b/i,
  /\bconfirmed legal violation\b/i,
  /\bdefinitely illegal\b/i,
  /\billegal\b/i,
  /\bmust sue\b/i,
  /\bsue them\b/i,
  /\bentitled to damages\b/i,
  /\bpunitive damages\b/i,
];

function compactText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const compacted = compactText(value);
  return compacted ? compacted : null;
}

function listPlaceholders(text: string | null | undefined): string[] {
  const found = new Set<string>();
  if (!text) return [];

  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const token = match[1]?.trim();
    if (token) found.add(token);
  }

  return Array.from(found).sort((a, b) => a.localeCompare(b));
}

function assertSafeTemplateText(field: TemplateTextField, text: string | null): void {
  if (!text) return;

  const matched = UNSAFE_TEMPLATE_CLAIMS.find((pattern) => pattern.test(text));
  if (matched) {
    throw new Error(`ai_letter_template_unsafe_${field}`);
  }
}

function assertPlaceholdersPreserved(
  field: TemplateTextField,
  original: string | null,
  rewritten: string | null
): void {
  const originalTokens = listPlaceholders(original);
  const rewrittenTokens = listPlaceholders(rewritten);

  if (originalTokens.join("|") !== rewrittenTokens.join("|")) {
    throw new Error(`ai_letter_template_placeholder_mismatch_${field}`);
  }
}

function hasRemovalFallback(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    /\b(delete|remove|suppress)\b/.test(normalized) &&
    /\btradeline|account|item|information\b/.test(normalized)
  );
}

function hasSpecificRemedyPlaceholder(text: string): boolean {
  return /\{\{\s*(specificRemedy|requiredRemedy)\s*\}\}/.test(text);
}

function hasRequestedCorrectionCue(text: string): boolean {
  const normalized = text.toLowerCase();
  return /\b(correct|correction|remedy|repair|update|delete|remove|suppress|request|requested)\b/.test(
    normalized
  );
}

function ensureSpecificRemedyRemovalFallback(text: string): string {
  if (!hasSpecificRemedyPlaceholder(text) || hasRemovalFallback(text)) {
    return text;
  }

  return compactText(
    `${text} If unverifiable, delete, remove, or suppress the tradeline.`
  );
}

function assertRequiredRemedyConcepts(
  field: TemplateTextField,
  original: string | null,
  rewritten: string | null
): void {
  if (field !== "requestedAction" || !original || !rewritten) return;

  if (
    original.toLowerCase().includes("requested correction by disputed field") &&
    (!hasSpecificRemedyPlaceholder(rewritten) || !hasRequestedCorrectionCue(rewritten))
  ) {
    throw new Error("ai_letter_template_missing_disputed_field_correction");
  }

  if (hasRemovalFallback(original) && !hasRemovalFallback(rewritten)) {
    throw new Error("ai_letter_template_missing_removal_fallback");
  }
}

function naturalizeTemplateText(field: TemplateTextField, text: string): string {
  let output = compactText(text)
    .replace(
      /This is a formal dispute and reinvestigation request to ([^.]+)\./gi,
      "I am asking $1 to review and reinvestigate this dispute."
    )
    .replace(
      /This is a formal dispute and reinvestigation request regarding the account information identified below\./gi,
      "I am asking you to review and reinvestigate the account information identified below."
    )
    .replace(
      /The letter is intended to identify me, identify the exact account and disputed fields, state the factual basis, reference supporting evidence, request correction or deletion of unverifiable data, and preserve a written audit trail\./gi,
      "I have included my identifying information, the exact account and fields I dispute, the factual basis, the evidence references, and the correction I am requesting."
    )
    .replace(/Please complete the reinvestigation/gi, "Please complete the review")
    .replace(/Please provide/gi, "Please send")
    .replace(/I certify that/gi, "I confirm that");

  if (field === "requestedAction") {
    output = output
      .replace(/^I request that you:\s*/i, "Please:")
      .replace(/\bconduct a reasonable investigation\b/gi, "review the disputed information carefully")
      .replace(/\bcorrect or delete\b/gi, "correct, delete, or suppress");
    output = ensureSpecificRemedyRemovalFallback(output);
  }

  return compactText(output);
}

export function buildDeterministicHumanizedLetterTemplate(
  snapshot: LetterTemplateSnapshot
): LetterTemplateSnapshot {
  const next: LetterTemplateSnapshot = { ...snapshot };

  for (const field of TEMPLATE_TEXT_FIELDS) {
    const value = snapshot[field];
    if (!value?.trim()) continue;
    next[field] = naturalizeTemplateText(field, value);
  }

  return next;
}

function templateSectionsForAi(snapshot: LetterTemplateSnapshot): Record<TemplateTextField, string> {
  const sections = {} as Record<TemplateTextField, string>;

  for (const field of TEMPLATE_TEXT_FIELDS) {
    const value = snapshot[field];
    if (value?.trim()) sections[field] = value;
  }

  return sections;
}

function validateHumanizedTemplate(
  original: LetterTemplateSnapshot,
  humanized: LetterTemplateSnapshot
): TemplateValidationResult {
  for (const field of TEMPLATE_TEXT_FIELDS) {
    assertPlaceholdersPreserved(field, original[field], humanized[field]);
    assertSafeTemplateText(field, humanized[field]);
    assertRequiredRemedyConcepts(field, original[field], humanized[field]);
  }

  const validation = validateTemplateSnapshot(humanized, "PUBLISH");
  if (validation.errors.length > 0 || validation.unknownPlaceholders.length > 0) {
    throw new Error("ai_letter_template_validation_failed");
  }

  return validation;
}

function parseAiHumanizedTemplate(
  value: unknown,
  original: LetterTemplateSnapshot
): LetterTemplateSnapshot {
  const parsed = aiRewriteSchema.parse(value);
  const deterministic = buildDeterministicHumanizedLetterTemplate(original);

  const humanized = buildTemplateSnapshot({
    ...original,
    subject: normalizeNullableText(parsed.subject) ?? deterministic.subject,
    introduction: normalizeNullableText(parsed.introduction) ?? deterministic.introduction,
    requestedAction: normalizeNullableText(parsed.requestedAction) ?? deterministic.requestedAction,
    statutoryTimeframe:
      normalizeNullableText(parsed.statutoryTimeframe) ?? deterministic.statutoryTimeframe,
    consumerStatementRight:
      normalizeNullableText(parsed.consumerStatementRight) ?? deterministic.consumerStatementRight,
    certification: normalizeNullableText(parsed.certification) ?? deterministic.certification,
    closing: normalizeNullableText(parsed.closing) ?? deterministic.closing,
    fullBodyOverride: normalizeNullableText(parsed.fullBodyOverride) ?? deterministic.fullBodyOverride,
    statutoryGrounds: original.statutoryGrounds,
    statutoryReference: original.statutoryReference,
    sourceUrl: original.sourceUrl,
  });

  validateHumanizedTemplate(original, humanized);
  return humanized;
}

export function validateAiLetterTemplateRewrite(
  value: unknown,
  original: LetterTemplateSnapshot
): LetterTemplateSnapshot {
  return parseAiHumanizedTemplate(value, original);
}

export async function generateHumanizedLetterTemplate(params: {
  snapshot: LetterTemplateSnapshot;
  userId?: number | null;
  userRole?: "admin" | "support" | "user" | string | null;
}): Promise<LetterTemplateHumanizeResult> {
  const deterministic = buildDeterministicHumanizedLetterTemplate(params.snapshot);
  const sections = templateSectionsForAi(params.snapshot);

  const assistInput = {
    category: params.snapshot.category,
    templateKey: params.snapshot.templateKey,
    label: params.snapshot.label,
    sections,
    preservedSections: {
      statutoryGrounds: params.snapshot.statutoryGrounds,
      statutoryReference: params.snapshot.statutoryReference,
      sourceUrl: params.snapshot.sourceUrl,
    },
  };

  const result = await runOpenAiJsonAssist({
    featureKey: AI_LETTER_TEMPLATE_HUMANIZE_FEATURE_KEY,
    subjectType: "letter_template",
    subjectId: params.snapshot.id ?? null,
    userId: params.userId ?? null,
    userRole: params.userRole,
    inputForHash: assistInput,
    timeoutMs: 30_000,
    systemPrompt: [
      "You rewrite Canadian credit bureau dispute letter template sections into clear human-sounding language.",
      "Keep the letter controlled, factual, firm, and non-emotional.",
      "Preserve every placeholder token exactly, including the braces and token names.",
      "Do not add new placeholders, facts, dates, dollar amounts, account numbers, legal conclusions, threats, guarantees, or litigation advice.",
      "Do not rewrite statutory grounds, statute names, statute text, source URLs, or statutory references.",
      "The output must remain suitable for TransUnion Canada, Equifax Canada, and provincial consumer-reporting disputes.",
      "Requested-action text must keep the exact remedy and the fallback that unverifiable information, items, or tradelines must be deleted, removed, or suppressed.",
      "Return JSON with only these optional string fields when present in the input: subject, introduction, requestedAction, statutoryTimeframe, consumerStatementRight, certification, closing, fullBodyOverride.",
    ].join(" "),
    userPrompt: JSON.stringify(assistInput),
    parseOutput: (value) => validateAiLetterTemplateRewrite(value, params.snapshot),
  });

  if (result.status === "ok" && result.output) {
    return {
      source: "ai",
      status: "ok",
      provider: result.provider,
      model: result.model,
      template: result.output,
      validation: validateHumanizedTemplate(params.snapshot, result.output),
    };
  }

  return {
    source: "deterministic",
    status: result.status,
    provider: result.provider,
    model: result.model,
    template: deterministic,
    validation: validateTemplateSnapshot(deterministic, "PUBLISH"),
    errorCode: result.errorCode ?? null,
  };
}
