import type { LetterContent } from "./pdfGenerator";

const NARRATIVE_KEYS = [
  "subject",
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
    pattern: /\brequest\s+for\s+removal\b/gi,
    replacement: "request for reinvestigation and correction",
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
    pattern: /\bfraudulent\s+chain\s+of\s+title\b/gi,
    replacement: "unverified chain of title",
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
    pattern: /\blegal\s+time\s+limit\b/gi,
    replacement: "applicable response timeframe",
  },
  {
    pattern: /\blegal\s+proceedings?\b/gi,
    replacement: "regulatory or documentation review",
  },
  {
    pattern: /\blitigation\b/gi,
    replacement: "further review",
  },
  {
    pattern: /\bcourt-ready\b/gi,
    replacement: "organized",
  },
  {
    pattern: /\battorney-client\s+privilege\b/gi,
    replacement: "consumer privacy",
  },
  {
    pattern: /\blegal\s+privilege\s+asserted\b/gi,
    replacement: "private consumer record",
  },
  {
    pattern: /\bunder\s+penalty\s+of\s+law\b/gi,
    replacement: "to the best of my knowledge",
  },
  {
    pattern: /\bI\s+reserve\s+my\s+right\b/gi,
    replacement: "I understand I may be able",
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

function compactStructuredText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
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

function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasRequestedActionConcept(text: string, needles: string[]): boolean {
  const normalized = normalizeForComparison(text);
  return needles.some((needle) => normalized.includes(normalizeForComparison(needle)));
}

function appendIfMissing(parts: string[], sentence: string, needles: string[]) {
  const existing = parts.join(" ");
  if (!hasRequestedActionConcept(existing, needles)) {
    parts.push(sentence);
  }
}

function buildClarificationRequestedAction(originalAction?: string): string {
  const sanitizedOriginal = originalAction ? sanitizeNarrativeText(originalAction) : "";

  const documentationSentence = "Please provide the records and source documentation used to support each reported field.";
  const correctionSentence = "If any field is inaccurate or incomplete, please correct it and provide written confirmation.";
  const verificationSentence = "If any field, inquiry, account notation, or tradeline cannot be verified from source documentation, please delete or suppress the unverifiable information and explain the basis for any item that remains.";
  const closeSentence = "Please share your written findings, updated disclosure, furnisher name, method of verification, and next steps within the applicable response timeframe.";

  const parts = sanitizedOriginal ? [sanitizedOriginal] : [];

  appendIfMissing(parts, documentationSentence, ["source documentation", "records used to support", "records and source"]);
  appendIfMissing(parts, correctionSentence, ["correct it", "correct any", "correct the", "written confirmation"]);
  appendIfMissing(parts, verificationSentence, ["cannot be verified", "if unverified", "unverified information", "delete or suppress"]);
  appendIfMissing(parts, closeSentence, ["written findings", "updated disclosure", "method of verification", "response timeframe"]);

  return compactWhitespace(parts.join(" "));
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

    if (key === "statutoryGrounds") {
      (safeContent as Record<NarrativeKey, string>)[key] = compactStructuredText(value);
      continue;
    }

    (safeContent as Record<NarrativeKey, string>)[key] =
      sanitizeNarrativeText(value);
  }

  return safeContent;
}
