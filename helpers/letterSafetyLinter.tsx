import type { LetterContent } from "./pdfGenerator";

const NARRATIVE_KEYS = [
  "introduction",
  "accountIdentification",
  "disputedItems",
  "statutoryGrounds",
  "supportingDocumentation",
  "requestedAction",
  "statutoryTimeframe",
  "consumerStatementRight",
  "deliveryConfirmation",
  "certification",
] as const;

type NarrativeKey = typeof NARRATIVE_KEYS[number];

const TEXT_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  {
    pattern: /\b(remove|delete|re-delete)\s+(this|the)\s+(tradeline|account|information|item)\b/gi,
    replacement: "review and correct this reported information",
  },
  {
    pattern: /\bremove\b/gi,
    replacement: "review and correct",
  },
  {
    pattern: /\bdelete\b/gi,
    replacement: "review and correct",
  },
  {
    pattern: /\bcease reporting\b/gi,
    replacement: "review the reporting basis and provide clarification",
  },
  {
    pattern: /\bblock this fraudulent information\b/gi,
    replacement: "review this potentially unauthorized information",
  },
  {
    pattern: /\bfraudulent\b/gi,
    replacement: "potentially unauthorized",
  },
  {
    pattern: /\billegal(?:ly)?\b/gi,
    replacement: "inconsistent with reporting standards",
  },
  {
    pattern: /\bviolates?\b/gi,
    replacement: "may not align with",
  },
  {
    pattern: /\bdemand\b/gi,
    replacement: "request",
  },
];

function compactWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeNarrativeText(text: string): string {
  let output = text;
  for (const rule of TEXT_REPLACEMENTS) {
    output = output.replace(rule.pattern, rule.replacement);
  }

  output = output.replace(/\bimmediately\b/gi, "").replace(/\s{2,}/g, " ");
  return compactWhitespace(output);
}

function buildClarificationRequestedAction(originalAction?: string): string {
  const sanitizedOriginal = originalAction ? sanitizeNarrativeText(originalAction) : "";

  const documentationSentence = "Please provide the records and source documentation used to support each reported field.";
  const correctionSentence = "If any field is inaccurate or incomplete, please correct it and provide written confirmation.";
  const verificationSentence = "If any field cannot be verified, please explain what is missing and what clarification is required to complete verification.";
  const closeSentence = "Please share your written findings and next steps within the applicable response timeframe.";

  if (!sanitizedOriginal) {
    return `${documentationSentence} ${correctionSentence} ${verificationSentence} ${closeSentence}`;
  }

  return `${documentationSentence} ${correctionSentence} ${verificationSentence} ${closeSentence}`;
}

export function lintLetterContentForRegulatorSafety(
  letterContent: LetterContent
): LetterContent {
  const safeContent: LetterContent = { ...letterContent };

  for (const key of NARRATIVE_KEYS) {
    const value = safeContent[key];
    if (typeof value !== "string" || !value.trim()) continue;

    if (key === "requestedAction") {
      (safeContent as Record<NarrativeKey, string>)[key] =
        buildClarificationRequestedAction(value);
      continue;
    }

    (safeContent as Record<NarrativeKey, string>)[key] =
      sanitizeNarrativeText(value);
  }

  return safeContent;
}
