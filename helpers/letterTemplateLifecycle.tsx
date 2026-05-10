import { Selectable } from "kysely";
import { LetterTemplate } from "./schema";

export type LetterTemplateSaveMode = "DRAFT" | "PUBLISH" | "ROLLBACK";

export type LetterTemplateSnapshot = {
  id?: number;
  category: Selectable<LetterTemplate>["category"];
  templateKey: string;
  label: string;
  isActive: boolean;
  subject: string | null;
  introduction: string | null;
  statutoryGrounds: string | null;
  requestedAction: string | null;
  statutoryTimeframe: string | null;
  consumerStatementRight: string | null;
  certification: string | null;
  closing: string | null;
  fullBodyOverride: string | null;
  statutoryReference: string | null;
  sourceUrl: string | null;
};

export type TemplateValidationResult = {
  errors: string[];
  warnings: string[];
  unknownPlaceholders: string[];
};

const TEMPLATE_TEXT_FIELDS = [
  "subject",
  "introduction",
  "statutoryGrounds",
  "requestedAction",
  "statutoryTimeframe",
  "consumerStatementRight",
  "certification",
  "closing",
  "fullBodyOverride",
  "statutoryReference",
  "sourceUrl",
] as const satisfies ReadonlyArray<keyof LetterTemplateSnapshot>;

const KNOWN_TEMPLATE_PLACEHOLDERS = new Set([
  "accountNumber",
  "creditorName",
  "dateDrift",
  "consumerName",
  "consumerAddress",
  "previousNames",
  "previousAddresses",
  "sinLastDigits",
  "bureauName",
  "province",
  "currentDate",
  "creditReportReferenceNumber",
  "reportDate",
  "disputeReason",
  "exactDisputedFields",
  "disputedField",
  "reportedValue",
  "expectedValue",
  "specificIssue",
  "specificConcern",
  "specificRemedy",
  "requiredRemedy",
  "regulatoryBasis",
  "originalCreditorName",
  "balance",
  "pastDueAmount",
  "lastReportedDate",
  "disputeDate",
  "statutoryReference",
]);

const PREVIEW_PLACEHOLDERS: Record<string, string> = {
  accountNumber: "****1234",
  creditorName: "Sample Creditor",
  dateDrift: "14 days",
  consumerName: "Sample Consumer",
  consumerAddress: "123 Main St, Halifax, NS",
  previousNames: "Sample Previous Name",
  previousAddresses: "456 Prior Ave, Dartmouth, NS",
  sinLastDigits: "1234",
  bureauName: "Equifax Canada",
  province: "Nova Scotia",
  currentDate: "2026-05-03",
  creditReportReferenceNumber: "L121322",
  reportDate: "2026-04-16",
  disputeReason: "accuracy and procedural defects",
  exactDisputedFields: "reported balance; account status; payment history",
  disputedField: "Reported Balance",
  reportedValue: "$1,250.00",
  expectedValue: "$0.00",
  specificIssue: "Reported Balance is reported as $1,250.00; expected/source-supported value is $0.00.",
  specificConcern: "Reported Balance is reported as $1,250.00; expected/source-supported value is $0.00.",
  specificRemedy:
    "Correct Reported Balance to $0.00. If that remedy cannot be completed from source records, delete or suppress the tradeline.",
  requiredRemedy:
    "Correct Reported Balance to $0.00. If that remedy cannot be completed from source records, delete or suppress the tradeline.",
  regulatoryBasis: "PIPEDA, Schedule 1, Principle 4.6",
  originalCreditorName: "Original Lender Inc.",
  balance: "$1,250.00",
  pastDueAmount: "$210.00",
  lastReportedDate: "2026-04-16",
  disputeDate: "2026-05-03",
  statutoryReference: "PIPEDA, Schedule 1",
};

const TOKEN_PATTERN = /{{\s*([a-zA-Z0-9_.]+)\s*}}/g;

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function listPlaceholders(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const token = match[1]?.trim();
    if (token) found.add(token);
  }
  return Array.from(found).sort((a, b) => a.localeCompare(b));
}

function hasMalformedPlaceholderSyntax(text: string): boolean {
  const opens = (text.match(/{{/g) || []).length;
  const closes = (text.match(/}}/g) || []).length;
  if (opens !== closes) return true;
  if (/{{\s*}}/.test(text)) return true;
  return false;
}

export function buildTemplateSnapshot(
  input: Partial<Selectable<LetterTemplate>> &
    Pick<Selectable<LetterTemplate>, "category" | "templateKey" | "label"> & {
      isActive: boolean;
    }
): LetterTemplateSnapshot {
  return {
    id: input.id,
    category: input.category,
    templateKey: input.templateKey.trim(),
    label: input.label.trim(),
    isActive: Boolean(input.isActive),
    subject: normalizeNullableText(input.subject),
    introduction: normalizeNullableText(input.introduction),
    statutoryGrounds: normalizeNullableText(input.statutoryGrounds),
    requestedAction: normalizeNullableText(input.requestedAction),
    statutoryTimeframe: normalizeNullableText(input.statutoryTimeframe),
    consumerStatementRight: normalizeNullableText(input.consumerStatementRight),
    certification: normalizeNullableText(input.certification),
    closing: normalizeNullableText(input.closing),
    fullBodyOverride: normalizeNullableText(input.fullBodyOverride),
    statutoryReference: normalizeNullableText(input.statutoryReference),
    sourceUrl: normalizeNullableText(input.sourceUrl),
  };
}

export function validateTemplateSnapshot(
  snapshot: LetterTemplateSnapshot,
  mode: LetterTemplateSaveMode
): TemplateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const unknownPlaceholderSet = new Set<string>();

  if (!/^[a-z0-9_]+$/.test(snapshot.templateKey)) {
    errors.push("Template key must contain only lowercase letters, numbers, and underscores.");
  }

  if (snapshot.sourceUrl && !/^https?:\/\//i.test(snapshot.sourceUrl)) {
    errors.push("Source URL must start with http:// or https://");
  }

  const publishContent = snapshot.fullBodyOverride
    ? snapshot.fullBodyOverride
    : [
        snapshot.subject,
        snapshot.introduction,
        snapshot.statutoryGrounds,
        snapshot.requestedAction,
        snapshot.statutoryTimeframe,
        snapshot.consumerStatementRight,
        snapshot.certification,
        snapshot.closing,
        snapshot.statutoryReference,
      ]
        .filter(Boolean)
        .join(" ");

  if (mode === "PUBLISH" && publishContent.trim().length === 0) {
    errors.push("Publishing requires at least one non-empty template section.");
  }

  for (const field of TEMPLATE_TEXT_FIELDS) {
    const value = snapshot[field];
    if (!value) continue;
    if (hasMalformedPlaceholderSyntax(value)) {
      errors.push(`Malformed placeholder syntax in "${field}".`);
      continue;
    }
    const tokens = listPlaceholders(value);
    for (const token of tokens) {
      if (!KNOWN_TEMPLATE_PLACEHOLDERS.has(token)) {
        unknownPlaceholderSet.add(token);
      }
    }
  }

  if (unknownPlaceholderSet.size > 0) {
    warnings.push(
      `Unknown placeholders detected: ${Array.from(unknownPlaceholderSet)
        .sort((a, b) => a.localeCompare(b))
        .join(", ")}`
    );
  }

  return {
    errors,
    warnings,
    unknownPlaceholders: Array.from(unknownPlaceholderSet).sort((a, b) =>
      a.localeCompare(b)
    ),
  };
}

export function renderTemplatePreview(snapshot: LetterTemplateSnapshot): {
  previewText: string;
  unresolvedPlaceholders: string[];
} {
  const rawContent = snapshot.fullBodyOverride
    ? snapshot.fullBodyOverride
    : [
        snapshot.subject ? `Subject: ${snapshot.subject}` : "",
        snapshot.introduction ? `Introduction: ${snapshot.introduction}` : "",
        snapshot.statutoryGrounds ? `Statutory Grounds: ${snapshot.statutoryGrounds}` : "",
        snapshot.requestedAction ? `Requested Action: ${snapshot.requestedAction}` : "",
        snapshot.statutoryTimeframe ? `Statutory Timeframe: ${snapshot.statutoryTimeframe}` : "",
        snapshot.consumerStatementRight
          ? `Consumer Statement Right: ${snapshot.consumerStatementRight}`
          : "",
        snapshot.certification ? `Certification: ${snapshot.certification}` : "",
        snapshot.closing ? `Closing: ${snapshot.closing}` : "",
        snapshot.statutoryReference ? `Statutory Reference: ${snapshot.statutoryReference}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

  const unresolved = new Set<string>();
  const previewText = rawContent.replace(TOKEN_PATTERN, (_, token: string) => {
    const replacement = PREVIEW_PLACEHOLDERS[token];
    if (replacement) return replacement;
    unresolved.add(token);
    return `[UNRESOLVED:${token}]`;
  });

  return {
    previewText,
    unresolvedPlaceholders: Array.from(unresolved).sort((a, b) => a.localeCompare(b)),
  };
}

export function getTemplateChangedFields(
  before: LetterTemplateSnapshot | null | undefined,
  after: LetterTemplateSnapshot
): string[] {
  if (!before) {
    return [
      "category",
      "templateKey",
      "label",
      "isActive",
      ...TEMPLATE_TEXT_FIELDS,
    ];
  }

  const fields: Array<keyof LetterTemplateSnapshot> = [
    "category",
    "templateKey",
    "label",
    "isActive",
    ...TEMPLATE_TEXT_FIELDS,
  ];

  const changed: string[] = [];
  for (const field of fields) {
    if (before[field] !== after[field]) {
      changed.push(field);
    }
  }
  return changed;
}
