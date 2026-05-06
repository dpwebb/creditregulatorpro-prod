import { z } from "zod";
import { ViolationCategoryArrayValues } from "./schema";

export const RuleConditionSchema = z.object({
  field: z.string(),
  operator: z.enum([
    "equals",
    "notEquals",
    "contains",
    "greaterThan",
    "lessThan",
    "isNull",
    "isNotNull",
    "olderThanDays",
    "newerThanDays",
    "matchesPattern",
  ]),
  value: z.any().optional(),
});

export const RuleDefinitionSchema = z.object({
  conditions: z.array(RuleConditionSchema),
  logic: z.enum(["AND", "OR"]),
});

const GeneratedSeveritySchema = z.enum(["ERROR", "WARNING", "INFO", "HIGH", "MEDIUM", "LOW"]);

export const GeneratedRuleSchema = z.object({
  title: z.string(),
  description: z.string(),
  ruleDefinition: RuleDefinitionSchema,
  violationCategory: z.enum(ViolationCategoryArrayValues),
  severity: GeneratedSeveritySchema,
  confidenceScore: z.number().min(0).max(100),
  userExplanationTemplate: z.string(),
  recommendedActionTemplate: z.string(),
  statutoryBasis: z.string(),
});

type RawGeneratedRule = z.infer<typeof GeneratedRuleSchema>;
export type GeneratedRule = Omit<RawGeneratedRule, "severity"> & {
  severity: "ERROR" | "WARNING" | "INFO";
  confidenceScore: number;
};

export interface RegulatoryUpdateInput {
  title: string;
  description: string;
  jurisdiction: string;
  changeType: string;
  statutoryReference: string | null;
  effectiveDate: string | null;
}

/**
 * Legacy AI rule generation is disabled.
 *
 * Dynamic scanning rules may still be created and edited manually through
 * explicit deterministic definitions. LLM output cannot create proposed
 * violation rules or become authoritative detection logic.
 */
export async function generateRuleFromUpdate(
  update: RegulatoryUpdateInput,
): Promise<GeneratedRule> {
  void update;
  throw new Error(
    "AI scanning rule generation is disabled by deterministic violation policy.",
  );
}
