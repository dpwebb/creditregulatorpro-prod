import { db } from "./db";
import { Insertable, Selectable } from "kysely";
import { LetterTemplate, LetterTemplateCategory } from "./schema";
import { LetterContent } from "./pdfGenerator";

export type { LetterTemplateCategory };

type TemplateVariables = Record<string, string | number | null | undefined>;

const TOKEN_PATTERN = /{{\s*([a-zA-Z0-9_.]+)\s*}}/g;

function normalizeTemplateValue(value: string | number | null | undefined): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function extractAccountValue(accountIdentification: string | undefined, labels: string[]): string {
  if (!accountIdentification) return "";
  const lines = accountIdentification.split(/\r?\n/);

  for (const line of lines) {
    const [rawLabel, ...rest] = line.split(":");
    if (!rawLabel || rest.length === 0) continue;

    const normalizedLabel = rawLabel.trim().toLowerCase();
    if (labels.some((label) => normalizedLabel === label.toLowerCase())) {
      return rest.join(":").trim();
    }
  }

  return "";
}

function inferProvinceFromAddress(addressLines: string[]): string {
  const joined = addressLines.join(" ");
  const codeMatch = joined.match(/\b(AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)\b/i);
  if (codeMatch?.[1]) return codeMatch[1].toUpperCase();

  const provinceNames = [
    "Alberta",
    "British Columbia",
    "Manitoba",
    "New Brunswick",
    "Newfoundland and Labrador",
    "Nova Scotia",
    "Northwest Territories",
    "Nunavut",
    "Ontario",
    "Prince Edward Island",
    "Quebec",
    "Saskatchewan",
    "Yukon",
  ];
  const lowered = joined.toLowerCase();
  return provinceNames.find((province) => lowered.includes(province.toLowerCase())) ?? "";
}

function compactRenderedText(text: string): string {
  return text
    .replace(/[ \t]+([,.;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\s+-\s*$/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildLetterTemplateVariables(letterContent: LetterContent): TemplateVariables {
  const creditorName = extractAccountValue(letterContent.accountIdentification, [
    "Creditor",
    "Creditor/Furnisher",
    "Furnisher Name",
    "Collection Agency",
    "Primary Collector",
  ]);
  const accountNumber = extractAccountValue(letterContent.accountIdentification, ["Account Number"]);
  const exactDisputedFields = extractAccountValue(letterContent.accountIdentification, [
    "Exact Field(s) Disputed",
  ]);
  const disputedField = extractAccountValue(letterContent.accountIdentification, [
    "Disputed Field",
  ]);
  const reportedValue = extractAccountValue(letterContent.accountIdentification, [
    "Reported Field Value",
  ]);
  const expectedValue = extractAccountValue(letterContent.accountIdentification, [
    "Expected / Source-Supported Value",
    "Expected Source-Supported Value",
  ]);
  const fileReference = letterContent.consumerFileReference?.creditReportReferenceNumber ?? "";
  const reportDate = letterContent.consumerFileReference?.reportDate ?? "";
  const templateVariables = letterContent.templateVariables ?? {};

  return {
    consumerName: letterContent.consumerName,
    consumerAddress: letterContent.consumerAddress.join(", "),
    previousNames: letterContent.consumerFileReference?.previousNames?.join("; ") ?? "",
    previousAddresses: letterContent.consumerFileReference?.previousAddresses?.join("; ") ?? "",
    sinLastDigits: letterContent.consumerFileReference?.sinLastDigits ?? "",
    creditReportReferenceNumber: fileReference,
    reportDate,
    bureauName: letterContent.recipientName,
    currentDate: letterContent.letterDate,
    creditorName,
    accountNumber,
    exactDisputedFields,
    disputedField: templateVariables.disputedField ?? disputedField,
    reportedValue: templateVariables.reportedValue ?? reportedValue,
    expectedValue: templateVariables.expectedValue ?? expectedValue,
    specificIssue: templateVariables.specificIssue ?? "",
    specificConcern: templateVariables.specificConcern ?? templateVariables.specificIssue ?? "",
    specificRemedy: templateVariables.specificRemedy ?? "",
    requiredRemedy: templateVariables.requiredRemedy ?? templateVariables.specificRemedy ?? "",
    regulatoryBasis: templateVariables.regulatoryBasis ?? letterContent.statutoryReference ?? "",
    province: inferProvinceFromAddress(letterContent.consumerAddress),
    statutoryReference: letterContent.statutoryReference,
    ...templateVariables,
  };
}

export function renderLetterTemplateText(text: string, variables: TemplateVariables): string {
  const rendered = text.replace(TOKEN_PATTERN, (_match, token: string) => {
    return normalizeTemplateValue(variables[token]);
  });

  return compactRenderedText(rendered);
}

function renderOverride(value: string | null | undefined, variables: TemplateVariables): string | null {
  if (!value?.trim()) return null;
  return renderLetterTemplateText(value, variables);
}

export async function listLetterTemplates(category?: LetterTemplateCategory): Promise<Selectable<LetterTemplate>[]> {
  let query = db.selectFrom("letterTemplate").selectAll();
  if (category) {
    query = query.where("category", "=", category);
  }
  return await query.orderBy("category", "asc").orderBy("label", "asc").execute();
}

export async function getLetterTemplate(category: LetterTemplateCategory, templateKey: string): Promise<Selectable<LetterTemplate> | undefined> {
  return await db
    .selectFrom("letterTemplate")
    .selectAll()
    .where("category", "=", category)
    .where("templateKey", "=", templateKey)
    .executeTakeFirst();
}

export async function upsertLetterTemplate(
  data: Omit<Insertable<LetterTemplate>, "id" | "updatedAt"> & { id?: number }
): Promise<Selectable<LetterTemplate>> {
  const now = new Date();
  
  if (data.id) {
    return await db
      .updateTable("letterTemplate")
      .set({ ...data, updatedAt: now })
      .where("id", "=", data.id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  // Fallback to check by category + templateKey if ID is missing
  const existing = await getLetterTemplate(data.category, data.templateKey);
  
  if (existing) {
    return await db
      .updateTable("letterTemplate")
      .set({ ...data, updatedAt: now })
      .where("id", "=", existing.id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  return await db
    .insertInto("letterTemplate")
    .values(data)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function deleteLetterTemplate(id: number): Promise<void> {
  await db
    .updateTable("letterTemplate")
    .set({ isActive: false, updatedAt: new Date() })
    .where("id", "=", id)
    .execute();
}

export async function resolveTemplateOverrides(
  category: LetterTemplateCategory,
  templateKey: string
): Promise<Selectable<LetterTemplate> | null> {
  const template = await getLetterTemplate(category, templateKey);
  if (template && template.isActive) {
    return template;
  }
  return null;
}

export async function applyTemplateOverrides(
  letterContent: LetterContent,
  category: LetterTemplateCategory,
  templateKey: string
): Promise<LetterContent> {
  const overrides = await resolveTemplateOverrides(category, templateKey);
  if (!overrides) {
    return letterContent;
  }

  const merged: LetterContent = { ...letterContent };
  const variables = buildLetterTemplateVariables(letterContent);

  if (overrides.fullBodyOverride) {
    merged.introduction = renderLetterTemplateText(overrides.fullBodyOverride, variables);
    // Removing these sections if full body override is active
        merged.disputedItems = undefined as any;
    merged.statutoryGrounds = undefined as any;
    merged.requestedAction = undefined as any;
  } else {
    const introduction = renderOverride(overrides.introduction, variables);
    const statutoryGrounds = renderOverride(overrides.statutoryGrounds, variables);
    const requestedAction = renderOverride(overrides.requestedAction, variables);

    if (introduction) merged.introduction = introduction;
    if (statutoryGrounds) merged.statutoryGrounds = statutoryGrounds;
    if (requestedAction) merged.requestedAction = requestedAction;
  }

  const subject = renderOverride(overrides.subject, variables);
  const statutoryTimeframe = renderOverride(overrides.statutoryTimeframe, variables);
  const consumerStatementRight = renderOverride(overrides.consumerStatementRight, variables);
  const certification = renderOverride(overrides.certification, variables);
  const closing = renderOverride(overrides.closing, variables);
  const statutoryReference = renderOverride(overrides.statutoryReference, variables);
  const sourceUrl = renderOverride(overrides.sourceUrl, variables);

  if (subject) merged.subject = subject;
  if (statutoryTimeframe) merged.statutoryTimeframe = statutoryTimeframe;
  if (consumerStatementRight) merged.consumerStatementRight = consumerStatementRight;
  if (certification) merged.certification = certification;
  if (closing) merged.closing = closing;
  if (statutoryReference) merged.statutoryReference = statutoryReference;
  if (sourceUrl) merged.sourceUrl = sourceUrl;

  return merged;
}
