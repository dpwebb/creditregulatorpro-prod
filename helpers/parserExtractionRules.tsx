import { Selectable } from "kysely";
import { db } from "./db";
import { Json, ParserExtractionRule } from "./schema";
import { ensureParserRulePromotionSchema } from "./parserRulePromotionSchema";
import { ComprehensiveParseResult, ParsedTradeline } from "./reportParserTypes";

export const SOURCE_LABEL_TO_TRADELINE_FIELD_RULE = "source_label_to_tradeline_field";

export type ParserExtractionRuleLike = Pick<
  Selectable<ParserExtractionRule>,
  "id" | "bureau" | "ruleType" | "fieldPath" | "targetField" | "config" | "isActive" | "priority"
>;

export interface ParserExtractionRuleApplication {
  parseResult: ComprehensiveParseResult;
  appliedRuleIds: number[];
}

function normalizeBureau(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .replace(/canada/g, "")
    .replace(/[^a-z]/g, "");
}

function bureauMatches(ruleBureau: string, resultBureau: string | null | undefined): boolean {
  const rule = normalizeBureau(ruleBureau);
  const actual = normalizeBureau(resultBureau);
  if (!rule || !actual) return false;
  return rule === actual || actual.includes(rule) || rule.includes(actual);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getRuleLabels(config: Record<string, unknown>): string[] {
  const labels = [
    typeof config.sourceLabel === "string" ? config.sourceLabel : null,
    ...(Array.isArray(config.sourceLabels) ? config.sourceLabels : []),
  ]
    .map((label) => (typeof label === "string" ? label.trim() : ""))
    .filter(Boolean);

  return Array.from(new Set(labels));
}

function extractLabeledLineValue(text: string | null | undefined, labels: string[]): string | null {
  if (!text || labels.length === 0) return null;

  for (const label of labels) {
    const pattern = new RegExp(`(?:^|\\n)\\s*${escapeRegExp(label)}\\s*:?\\s*([^\\r\\n]+)`, "i");
    const match = text.match(pattern);
    const value = match?.[1]?.trim();
    if (value) return value;
  }

  return null;
}

function normalizeValueForField(value: string, targetField: string, config: Record<string, unknown>): unknown {
  const valueType = typeof config.valueType === "string" ? config.valueType : null;
  if (valueType === "string") return value.trim();

  if (targetField === "remarkCodes" || valueType === "stringArray") {
    return value
      .split(/\s*,\s*/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return value.trim();
}

function hasMeaningfulValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value == null) return false;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return Boolean(normalized) && !["unknown", "not reported", "blank", "n/a", "na"].includes(normalized);
  }
  return true;
}

function tokenizePath(path: string): Array<string | number> {
  const tokens: Array<string | number> = [];
  const matcher = /([^[.\]]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(path))) {
    if (match[1] !== undefined) tokens.push(match[1]);
    if (match[2] !== undefined) tokens.push(Number(match[2]));
  }

  return tokens;
}

function setValueAtPath(target: Record<string, unknown>, path: string, value: unknown) {
  const tokens = tokenizePath(path);
  if (tokens.length === 0) return;

  let cursor: any = target;
  tokens.forEach((token, index) => {
    const isLast = index === tokens.length - 1;
    if (isLast) {
      cursor[token] = value;
      return;
    }

    const nextToken = tokens[index + 1];
    if (cursor[token] == null || typeof cursor[token] !== "object") {
      cursor[token] = typeof nextToken === "number" ? [] : {};
    }
    cursor = cursor[token];
  });
}

function getValueAtPath(target: Record<string, unknown>, path: string): unknown {
  const tokens = tokenizePath(path);
  let cursor: any = target;

  for (const token of tokens) {
    if (cursor == null || typeof cursor !== "object") return undefined;
    cursor = cursor[token];
  }

  return cursor;
}

function cloneTradeline(tradeline: ParsedTradeline): ParsedTradeline {
  return {
    ...tradeline,
    dates: { ...tradeline.dates },
    amounts: { ...tradeline.amounts },
    remarkCodes: Array.isArray(tradeline.remarkCodes) ? [...tradeline.remarkCodes] : [],
    paymentHistory: tradeline.paymentHistory ? { ...tradeline.paymentHistory } : null,
    paymentHistoryDetails: tradeline.paymentHistoryDetails
      ? tradeline.paymentHistoryDetails.map((entry) => ({ ...entry }))
      : null,
  };
}

export async function loadActiveParserExtractionRules(
  bureauName: string | null | undefined,
): Promise<Selectable<ParserExtractionRule>[]> {
  await ensureParserRulePromotionSchema();

  const rules = await db
    .selectFrom("parserExtractionRule")
    .selectAll()
    .where("isActive", "=", true)
    .orderBy("priority", "desc")
    .orderBy("id", "asc")
    .execute();

  return rules.filter((rule) => bureauMatches(rule.bureau, bureauName));
}

export function applyParserExtractionRules(
  parseResult: ComprehensiveParseResult,
  rules: ParserExtractionRuleLike[],
): ParserExtractionRuleApplication {
  if (!rules.length) {
    return { parseResult, appliedRuleIds: [] };
  }

  const nextResult: ComprehensiveParseResult = {
    ...parseResult,
    consumerInfo: parseResult.consumerInfo ? { ...parseResult.consumerInfo } : null,
    reportMetadata: parseResult.reportMetadata ? { ...parseResult.reportMetadata } : null,
    sourceBureau: parseResult.sourceBureau ? { ...parseResult.sourceBureau } : null,
    tradelines: parseResult.tradelines.map(cloneTradeline),
    inquiries: parseResult.inquiries.map((entry) => ({ ...entry })),
    publicRecords: parseResult.publicRecords.map((entry) => ({ ...entry })),
    employmentInfo: parseResult.employmentInfo.map((entry) => ({ ...entry })),
    creditScores: parseResult.creditScores.map((entry) => ({ ...entry })),
    consumerStatements: parseResult.consumerStatements.map((entry) => ({ ...entry })),
    paymentHistories: parseResult.paymentHistories.map((entry) => ({ ...entry })),
  };
  const appliedRuleIds = new Set<number>();

  for (const rule of [...rules].sort((a, b) => b.priority - a.priority || a.id - b.id)) {
    if (!rule.isActive && rule.id > 0) continue;
    if (rule.ruleType !== SOURCE_LABEL_TO_TRADELINE_FIELD_RULE) continue;

    const config = asRecord(rule.config);
    const labels = getRuleLabels(config);
    const targetField = rule.targetField;
    const overwriteExisting = config.overwriteExisting === true;

    if (!targetField || labels.length === 0) continue;

    nextResult.tradelines.forEach((tradeline) => {
      const sourceValue = extractLabeledLineValue(tradeline.sourceText, labels);
      if (!sourceValue) return;

      const currentValue = getValueAtPath(tradeline as unknown as Record<string, unknown>, targetField);
      if (!overwriteExisting && hasMeaningfulValue(currentValue)) return;

      const normalizedValue = normalizeValueForField(sourceValue, targetField, config);
      if (!hasMeaningfulValue(normalizedValue)) return;

      setValueAtPath(tradeline as unknown as Record<string, unknown>, targetField, normalizedValue);
      appliedRuleIds.add(rule.id);
    });
  }

  return {
    parseResult: nextResult,
    appliedRuleIds: Array.from(appliedRuleIds),
  };
}

export function parserExtractionRuleConfigToJson(config: Record<string, unknown>): Json {
  return JSON.parse(JSON.stringify(config)) as Json;
}
